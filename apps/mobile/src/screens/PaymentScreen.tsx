import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  INTERIOR_CATEGORY_LABELS,
  PLATFORM_FEE_RATE,
  REQUEST_KIND_LABELS,
  type InteriorRequest,
  type ServiceRequest,
} from '@dimol/shared';
import { ApiError, getInteriorRequest, getRequest, prepay } from '../api/client';
import { AppButton, ErrorBanner, LoadingView, StickyFooter } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, useNavigation } from '../navigation';
import { theme } from '../theme';

/**
 * 선결제 화면 — 매칭 확정(금액 합의)된 요청의 총액을 선결제한다.
 * 금액은 서버 확정 금액(request.agreedFee)이며 여기서 임의로 바꿀 수 없다.
 * 결제수단은 계좌이체(가상계좌) 기본 + 카드 병행(B2B 고액은 계좌이체 우선 유도).
 */
type PayMethod = 'VBANK' | 'CARD';

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
  const [request, setRequest] = useState<ServiceRequest | InteriorRequest | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>('VBANK');
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const fetchRequest = source === 'interior' ? getInteriorRequest(requestId) : getRequest(requestId);
    fetchRequest
      .then(setRequest)
      .catch((err) => setError(err instanceof ApiError ? err.message : '요청을 불러오지 못했습니다.'));
  }, [requestId, source]);

  async function pay() {
    setError(null);
    setPaying(true);
    try {
      await prepay({ matchRequestId: requestId, completedDate: todayKST(), payMethod });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '결제 처리에 실패했습니다.');
    } finally {
      setPaying(false);
    }
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
  const fee = Math.round(amount * PLATFORM_FEE_RATE);
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

  return (
    <View style={styles.screen}>
      <ScreenHeader title="결제" canGoBack />
      <ScrollView contentContainerStyle={styles.content}>
        <FadeInUp delay={40}>
          <View style={styles.heroCard}>
            <Text style={styles.amountLabel}>{headline}</Text>
            <Text style={styles.amount}>{amount.toLocaleString('ko-KR')}원</Text>
            <Text style={styles.feeNote}>
              수수료 {Math.round(PLATFORM_FEE_RATE * 100)}%({fee.toLocaleString('ko-KR')}원)는 업체 정산 시 차감돼요
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

        <ErrorBanner message={error} />
      </ScrollView>
      <StickyFooter>
        <AppButton
          label={`${amount.toLocaleString('ko-KR')}원 결제하기`}
          onPress={pay}
          loading={paying}
          disabled={amount <= 0}
        />
      </StickyFooter>
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
  amount: { color: colors.text, fontSize: font.titleLarge + 8, fontWeight: '800', marginTop: spacing.xs },
  feeNote: { color: colors.textMuted, fontSize: font.caption, marginTop: spacing.sm },
  methodTitle: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800', marginBottom: spacing.sm, marginTop: spacing.xs },
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
  doneTitle: { color: colors.text, fontSize: font.titleLarge, fontWeight: '800', textAlign: 'center' },
  doneDesc: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.sm, textAlign: 'center' },
});
