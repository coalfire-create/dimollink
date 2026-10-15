import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  INTERIOR_CATEGORY_LABELS,
  calculateDeal,
  REQUEST_KIND_LABELS,
  VIRTUAL_ACCOUNT_VALID_HOURS,
  type InteriorRequest,
  type ServiceRequest,
} from '@dimol/shared';
import * as PortOne from '@portone/react-native-sdk';
type PortOnePaymentProps = React.ComponentProps<typeof PortOne.Payment>;
type PaymentRequest = PortOnePaymentProps['request'];
type PaymentResponse = Parameters<NonNullable<PortOnePaymentProps['onComplete']>>[0];
import { ApiError, getInteriorRequest, getRequest, prepay } from '../api/client';
import { usePaymentConfig } from '../lib/payment-config';
import { useBuyerEmail } from '../lib/buyer-email';
import { BuyerEmailModal } from '../components/BuyerEmailModal';
import { AppButton, ErrorBanner, LoadingView, StickyFooter } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, useNavigation, useSession } from '../navigation';
import { AppIcon } from '../components/AppIcon';
import { won } from '../lib/format';
import {
  requestWebRequestPayment,
  takeRequestPaymentReturn,
  type RequestPayMethod,
} from '../lib/request-web-payment';
import { theme } from '../theme';

/** 결제 건 고유 식별자(앱에서 채번, PortOne·서버가 이 값으로 결제를 추적). */
function newPaymentId(): string {
  return `payment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 선결제 화면 — 매칭 확정(금액 합의)된 요청의 총액을 선결제한다.
 * 금액은 서버 확정 금액(request.agreedFee)이며 여기서 임의로 바꿀 수 없다.
 * 결제수단은 계좌이체(가상계좌) 기본 + 카드 병행(B2B 고액은 계좌이체 우선 유도).
 *
 * 결제창은 앱이면 React Native SDK(WebView), 웹이면 브라우저 SDK([[request-web-payment.web]]).
 * 모바일 브라우저는 결제사 페이지에 갔다가 돌아오므로 화면이 열릴 때 돌아온 결과를 마저 검증한다.
 */
type PayMethod = RequestPayMethod;

const isWeb = Platform.OS === 'web';

function todayKST(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 인테리어 요청인지 판별(합의 금액·표시 라벨을 종류별로 다르게 구성). */
function isInterior(r: ServiceRequest | InteriorRequest): r is InteriorRequest {
  return r.kind === 'INTERIOR';
}

export function PaymentScreen({
  requestId,
  source = 'waste',
}: {
  requestId: string;
  source?: 'waste' | 'interior';
}) {
  const nav = useNavigation();
  const portone = usePaymentConfig();
  const buyer = useBuyerEmail(useSession());
  const [request, setRequest] = useState<ServiceRequest | InteriorRequest | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>('VBANK');
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  // PortOne 결제창(WebView)을 띄울 요청. null 이면 결제창 미표시.
  const [payRequest, setPayRequest] = useState<Omit<PaymentRequest, 'requestUrl'> | null>(null);

  useEffect(() => {
    const fetchRequest =
      source === 'interior' ? getInteriorRequest(requestId) : getRequest(requestId);
    fetchRequest
      .then(setRequest)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : '요청을 불러오지 못했습니다.'),
      );
  }, [requestId, source]);

  // 모바일 브라우저 결제는 결제사 페이지에 갔다가 돌아온다 — 돌아온 결과를 마저 검증한다.
  useEffect(() => {
    if (!isWeb) return;
    const back = takeRequestPaymentReturn(requestId);
    if (!back) return;
    setPayMethod(back.payMethod);
    void finishPayment(back, back.payMethod);
    // 화면이 처음 열릴 때 한 번만 본다(주소창에서 이미 지웠다).
  }, []);

  /** 결제하기 → PortOne 결제창 오픈. paymentId 를 채번해 결제를 시작한다. */
  function pay() {
    setError(null);
    if (!request) return;
    // 선결제 — 서버 확정 금액 전액. 서버가 포트원 결제 금액이 agreedFee 와 같은지 검증하므로
    // 여기서 일부만 청구하면 돈은 빠져나가고 결제 확정은 실패한다.
    const total = request.agreedFee ?? 0;
    if (total <= 0) {
      setError('결제 금액을 확인할 수 없습니다.');
      return;
    }
    if (!portone.channelKey) {
      setError('결제 설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      return;
    }
    buyer.withCustomer((customer) => {
      const orderName = isInterior(request)
        ? `인테리어 시공 · ${INTERIOR_CATEGORY_LABELS[request.category]}`
        : `${REQUEST_KIND_LABELS[request.kind]} · ${request.wasteTons}톤`;
      if (isWeb) {
        setPaying(true);
        requestWebRequestPayment({
          storeId: portone.storeId,
          channelKey: portone.channelKey,
          paymentId: newPaymentId(),
          orderName,
          totalAmount: total,
          payMethod,
          customer,
          requestId,
          source,
        })
          .then((res) => {
            setPaying(false);
            // undefined = 결제사 페이지로 이동했다(돌아오면 위 effect 가 받는다).
            if (res) void finishPayment(res, payMethod);
          })
          .catch((err: unknown) => {
            setPaying(false);
            setError(err instanceof Error ? err.message : '결제창을 열지 못했어요.');
          });
        return;
      }
      setPayRequest({
        storeId: portone.storeId,
        channelKey: portone.channelKey,
        paymentId: newPaymentId(),
        orderName,
        totalAmount: total,
        currency: 'CURRENCY_KRW',
        payMethod: payMethod === 'VBANK' ? 'VIRTUAL_ACCOUNT' : 'CARD',
        // KG이니시스는 가상계좌 입금기한이 필수다.
        ...(payMethod === 'VBANK'
          ? { virtualAccount: { accountExpiry: { validHours: VIRTUAL_ACCOUNT_VALID_HOURS } } }
          : {}),
        customer,
        appScheme: 'dimollink',
      } as PaymentRequest);
    });
  }

  /** 앱 결제창(WebView) 완료 콜백. */
  function onPaymentComplete(res: PaymentResponse) {
    setPayRequest(null);
    void finishPayment(
      {
        paymentId: res.paymentId,
        code: 'code' in res && res.code != null ? String(res.code) : undefined,
        message: 'message' in res ? res.message : undefined,
      },
      payMethod,
    );
  }

  /**
   * 결제창 결과(앱·웹·리다이렉트 공통) → 서버가 결제를 조회·검증(금액 일치)하고 선결제를 확정한다.
   * 결제수단은 인자로 받는다 — 리다이렉트로 돌아온 경우 화면 상태가 아직 기본값이다.
   */
  async function finishPayment(
    res: { paymentId?: string; code?: string; message?: string },
    method: PayMethod,
  ) {
    if (res.code) {
      setError(res.message || '결제에 실패했어요. 다시 시도해 주세요.');
      return;
    }
    if (!res.paymentId) {
      setError('결제 정보를 확인하지 못했어요.');
      return;
    }
    setPaying(true);
    try {
      await prepay({
        matchRequestId: requestId,
        paymentId: res.paymentId,
        completedDate: todayKST(),
        payMethod: method,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '결제 검증에 실패했습니다.');
    } finally {
      setPaying(false);
    }
  }

  function onPaymentError(err: Error) {
    setPayRequest(null);
    setError(err.message || '결제가 취소되었거나 실패했습니다.');
  }

  if (!request) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="결제" canGoBack />
        <ErrorBanner message={error} />
        {error ? null : <LoadingView />}
      </View>
    );
  }

  const amount = request.agreedFee ?? 0;
  // 수수료 계산은 서버 정산과 같은 공유 함수를 쓴다 — 여기서 따로 계산하면
  // 반올림 규칙이 갈라져 화면 금액과 실제 정산액이 어긋난다([[marketplace]]).
  const deal = calculateDeal(amount);
  const headline = isInterior(request)
    ? `인테리어 시공 · ${INTERIOR_CATEGORY_LABELS[request.category]}`
    : `${REQUEST_KIND_LABELS[request.kind]} · ${request.wasteTons}톤`;

  if (done) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="결제 완료" canGoBack />
        <View style={styles.doneBox}>
          <FadeInUp>
            <View style={styles.doneCheck}>
              <Text style={styles.doneCheckMark}>✓</Text>
            </View>
            <Text style={styles.doneTitle}>결제가 완료됐어요</Text>
            <Text style={styles.doneDesc}>
              {payMethod === 'VBANK'
                ? '가상계좌 입금 안내를 보냈어요. 입금되면 작업이 시작돼요.'
                : '카드 결제 완료. 곧 작업이 시작돼요.'}
            </Text>
          </FadeInUp>
        </View>
        <StickyFooter>
          <AppButton label="확인" onPress={() => nav.pop()} />
        </StickyFooter>
      </View>
    );
  }

  // 결제창 활성화 시 PortOne WebView 를 전체화면으로 띄운다.
  if (payRequest) {
    return (
      <View style={styles.screen}>
        <PortOne.Payment
          request={payRequest}
          onError={onPaymentError}
          onComplete={onPaymentComplete}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="결제" canGoBack />
      <ScrollView contentContainerStyle={styles.content}>
        <FadeInUp delay={40}>
          <View style={styles.heroCard}>
            <Text style={styles.amountLabel}>{headline}</Text>
            <Text style={styles.amount}>{amount.toLocaleString('ko-KR')}원</Text>
            <Text style={styles.feeNote}>
              수수료 {Math.round(deal.feeRate * 100)}%(
              {deal.platformFee.toLocaleString('ko-KR')}원)는 업체 정산 시 차감돼요
            </Text>
            <Text style={styles.feeNote}>
              업체 수령액 {deal.sellerPayout.toLocaleString('ko-KR')}원
            </Text>
          </View>
        </FadeInUp>

        <Text style={styles.methodTitle}>결제수단</Text>
        {(['VBANK', 'CARD'] as PayMethod[]).map((m, i) => {
          const selected = payMethod === m;
          return (
            <FadeInUp key={m} delay={120 + i * 70}>
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel={m === 'VBANK' ? '계좌이체(가상계좌)로 결제' : '카드로 결제'}
                accessibilityState={{ checked: selected }}
                onPress={() => setPayMethod(m)}
                style={[styles.methodCard, selected && styles.methodSelected]}
              >
                <Text style={[styles.methodLabel, selected && { color: theme.colors.primary }]}>
                  {selected ? '✓ ' : ''}
                  {m === 'VBANK' ? '계좌이체 (가상계좌)' : '카드 결제'}
                </Text>
                {m === 'VBANK' ? (
                  <Text style={styles.methodHint}>수수료 부담이 적어요 · 권장</Text>
                ) : null}
              </Pressable>
            </FadeInUp>
          );
        })}

        <View style={styles.trustBox}>
          <View style={styles.trustRow}>
            <AppIcon name="lock" size={18} color={theme.colors.textMuted} />
            <Text style={styles.trustLine}>안전한 결제는 포트원(PortOne)이 처리해요</Text>
          </View>
          <View style={styles.trustRow}>
            <AppIcon name="check" size={18} color={theme.colors.textMuted} />
            <Text style={styles.trustLine}>배차 전 취소 시 전액 환불돼요</Text>
          </View>
        </View>

        <ErrorBanner message={error} />
      </ScrollView>
      <StickyFooter>
        <AppButton
          label={`${won(amount)} 결제하기`}
          onPress={pay}
          loading={paying}
          disabled={amount <= 0}
        />
      </StickyFooter>
      <BuyerEmailModal {...buyer.prompt} />
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.lg },
  heroCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  amountLabel: { color: colors.primary, fontSize: font.body, fontWeight: '700' },
  amount: {
    color: colors.text,
    fontSize: font.titleLarge + 8,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  feeNote: { color: colors.textMuted, fontSize: font.caption, marginTop: spacing.sm },
  methodTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  methodCard: {
    backgroundColor: colors.background,
    borderColor: 'transparent',
    borderRadius: radius.card,
    borderWidth: 2,
    marginBottom: spacing.sm,
    padding: spacing.md,
    ...theme.shadow.card,
  },
  methodSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  methodLabel: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '700' },
  methodHint: { color: colors.textMuted, fontSize: font.caption, marginTop: spacing.xs / 2 },
  trustBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    gap: spacing.xs / 2,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  trustRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs / 2 },
  trustLine: { color: colors.textMuted, fontSize: font.body, fontWeight: '600' },
  doneBox: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.lg },
  doneCheck: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 88,
    justifyContent: 'center',
    marginBottom: spacing.md,
    width: 88,
    ...theme.shadow.primary,
  },
  doneCheckMark: { color: colors.background, fontSize: font.titleLarge + 12, fontWeight: '800' },
  doneTitle: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
    textAlign: 'center',
  },
  doneDesc: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
