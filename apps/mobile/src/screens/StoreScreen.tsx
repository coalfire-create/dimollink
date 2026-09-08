import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as PortOne from '@portone/react-native-sdk';
import type { SalesProduct } from '@dimol/shared';
import {
  ApiError,
  cancelSubscription,
  listProducts,
  listSubscriptions,
  purchaseProduct,
  subscribeProduct,
  type SafeSubscription,
} from '../api/client';
import { PORTONE } from '../config';
import { AppButton, Card, ErrorBanner, SectionTitle } from '../components/ui';
import { ScreenHeader } from '../navigation';
import { theme } from '../theme';

/**
 * 스토어 — 앱 안에서 실제로 결제되는 상품.
 *
 * **결제창이 갈린다.** PG 심사 요건이라 섞으면 반려된다:
 *  - 일반결제 → `PortOne.Payment` (일반결제창)
 *  - 월 정기결제 → `PortOne.IssueBillingKey` (정기결제창, 빌링키 발급)
 * 정기결제를 일반결제창으로 처리하면 매달 자동청구가 성립하지 않는다.
 *
 * 화면이 반드시 보여줘야 하는 것:
 *  - 일반결제: **서비스 제공기간**(결제 후 완료까지). 심사 필수 항목이다.
 *  - 정기결제: 결제 주기(월 1회)와 **해지 방법**.
 */

type PaymentRequest = React.ComponentProps<typeof PortOne.Payment>['request'];
type PaymentResponse = Parameters<
  NonNullable<React.ComponentProps<typeof PortOne.Payment>['onComplete']>
>[0];
type BillingKeyRequest = React.ComponentProps<typeof PortOne.IssueBillingKey>['request'];
type BillingKeyResponse = Parameters<
  NonNullable<React.ComponentProps<typeof PortOne.IssueBillingKey>['onComplete']>
>[0];

/** 결제 건 식별자. 서버·PG 가 이 값으로 결제를 추적한다. */
function newPaymentId(): string {
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function won(value: number): string {
  return `${value.toLocaleString('ko-KR')}원`;
}

export function StoreScreen() {
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [subs, setSubs] = useState<SafeSubscription[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /** 결제창 요청. 둘 중 하나만 열린다 — 같은 화면에 두 창이 뜨면 안 된다. */
  const [payRequest, setPayRequest] = useState<PaymentRequest | null>(null);
  const [billingRequest, setBillingRequest] = useState<BillingKeyRequest | null>(null);
  /** 결제창을 연 상품. 콜백에서 어떤 상품인지 알아야 한다. */
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setProducts(await listProducts());
      setSubs(await listSubscriptions().catch(() => []));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '상품을 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── 일반결제: 일반결제창 ──────────────────────────────────────────────
  function startOneTime(product: SalesProduct) {
    setError(null);
    setNotice(null);
    setPendingProductId(product.id);
    setPayRequest({
      storeId: PORTONE.storeId,
      channelKey: PORTONE.channelKey,
      paymentId: newPaymentId(),
      orderName: product.name,
      totalAmount: product.price,
      currency: 'CURRENCY_KRW',
      payMethod: 'CARD',
    });
  }

  async function onPaymentComplete(res: PaymentResponse) {
    setPayRequest(null);
    const productId = pendingProductId;
    setPendingProductId(null);
    if ('code' in res && res.code != null) {
      setError(res.message || '결제에 실패했어요.');
      return;
    }
    if (!res.paymentId || !productId) {
      setError('결제 정보를 확인하지 못했어요.');
      return;
    }
    setBusyId(productId);
    try {
      // 금액은 서버가 상품가와 대조한다 — 앱이 보낸 값을 믿지 않는다.
      const result = await purchaseProduct(productId, res.paymentId);
      setNotice(`결제가 완료되었습니다. ${result.servicePeriod}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '결제 검증에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  // ── 정기결제: 정기결제창(빌링키 발급) ────────────────────────────────
  function startSubscription(product: SalesProduct) {
    setError(null);
    setNotice(null);
    setPendingProductId(product.id);
    setBillingRequest({
      storeId: PORTONE.storeId,
      channelKey: PORTONE.channelKey,
      billingKeyMethod: 'CARD',
      issueName: product.name,
    });
  }

  async function onBillingKeyComplete(res: BillingKeyResponse) {
    setBillingRequest(null);
    const productId = pendingProductId;
    setPendingProductId(null);
    if ('code' in res && res.code != null) {
      setError(res.message || '정기결제 등록에 실패했어요.');
      return;
    }
    if (!res.billingKey || !productId) {
      setError('결제수단 정보를 확인하지 못했어요.');
      return;
    }
    setBusyId(productId);
    try {
      await subscribeProduct(productId, res.billingKey);
      setNotice('정기결제가 등록되었습니다. 매월 같은 날 자동으로 결제됩니다.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '구독 등록에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(sub: SafeSubscription) {
    setBusyId(sub.id);
    setError(null);
    try {
      await cancelSubscription(sub.id);
      setNotice('해지되었습니다. 이미 결제한 이용 기간은 끝까지 사용할 수 있어요.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '해지에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  // 결제창은 전체화면 WebView 다. 열려 있는 동안 다른 화면을 그리지 않는다.
  if (payRequest) {
    return (
      <PortOne.Payment
        request={payRequest}
        onComplete={onPaymentComplete}
        onError={(err: Error) => {
          setPayRequest(null);
          setPendingProductId(null);
          setError(err.message || '결제창을 열지 못했어요.');
        }}
      />
    );
  }
  if (billingRequest) {
    return (
      <PortOne.IssueBillingKey
        request={billingRequest}
        onComplete={onBillingKeyComplete}
        onError={(err: Error) => {
          setBillingRequest(null);
          setPendingProductId(null);
          setError(err.message || '정기결제창을 열지 못했어요.');
        }}
      />
    );
  }

  const activeSubOf = (productId: string) =>
    subs.find((s) => s.productId === productId && s.status !== 'CANCELLED');

  return (
    <View style={styles.screen}>
      <ScreenHeader title="스토어" canGoBack />
      <ScrollView contentContainerStyle={styles.content}>
        <ErrorBanner message={error} />
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {products.map((product) => {
          const sub = activeSubOf(product.id);
          return (
            <Card key={product.id}>
              <Text style={styles.name}>{product.name}</Text>
              <Text style={styles.price}>
                {won(product.price)}
                {product.billingType === 'MONTHLY_SUBSCRIPTION' ? ' / 월' : ''}
              </Text>
              <Text style={styles.description}>{product.description}</Text>

              {product.benefits.map((b) => (
                <Text key={b} style={styles.benefit}>
                  · {b}
                </Text>
              ))}

              {product.billingType === 'ONE_TIME' ? (
                <>
                  {/* 심사 필수 — 결제 후 서비스 제공 완료까지의 기간 */}
                  <View style={styles.terms}>
                    <Text style={styles.termsLabel}>서비스 제공기간</Text>
                    <Text style={styles.termsValue}>{product.servicePeriod.label}</Text>
                  </View>
                  <AppButton
                    label="결제하기"
                    loading={busyId === product.id}
                    onPress={() => startOneTime(product)}
                  />
                </>
              ) : (
                <>
                  <View style={styles.terms}>
                    <Text style={styles.termsLabel}>결제 주기</Text>
                    <Text style={styles.termsValue}>매월 1회 자동결제 (월 단위)</Text>
                    <Text style={styles.termsLabel}>해지 방법</Text>
                    <Text style={styles.termsValue}>{product.cancellationNotice}</Text>
                  </View>
                  {sub ? (
                    <>
                      <Text style={styles.subState}>
                        구독 중 · 다음 결제일 {sub.nextBillingDate}
                        {sub.status === 'PAYMENT_FAILED' ? ' (결제 실패 — 카드를 확인해 주세요)' : ''}
                      </Text>
                      <AppButton
                        label="구독 해지"
                        variant="outline"
                        loading={busyId === sub.id}
                        onPress={() => void cancel(sub)}
                      />
                    </>
                  ) : (
                    <AppButton
                      label="정기결제 등록"
                      loading={busyId === product.id}
                      onPress={() => startSubscription(product)}
                    />
                  )}
                </>
              )}
            </Card>
          );
        })}

        {subs.filter((s) => s.status === 'CANCELLED').length > 0 ? (
          <>
            <SectionTitle>해지한 구독</SectionTitle>
            {subs
              .filter((s) => s.status === 'CANCELLED')
              .map((s) => (
                <Card key={s.id}>
                  <Text style={styles.description}>
                    {s.productId} · {s.currentPeriodEnd} 까지 이용 가능
                  </Text>
                </Card>
              ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.lg },
  notice: {
    backgroundColor: colors.primarySoft ?? colors.surface,
    borderRadius: 8,
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  name: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800' },
  price: { color: colors.primary, fontSize: font.title, fontWeight: '800', marginTop: spacing.xs / 2 },
  description: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: font.body * 1.5,
    marginTop: spacing.xs,
  },
  benefit: { color: colors.text, fontSize: font.body, marginTop: spacing.xs / 2 },
  terms: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  termsLabel: { color: colors.textMuted, fontSize: font.body, fontWeight: '700' },
  termsValue: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: font.body * 1.5,
    marginBottom: spacing.xs / 2,
  },
  subState: { color: colors.text, fontSize: font.body, fontWeight: '700', marginTop: spacing.sm },
});
