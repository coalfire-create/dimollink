import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { isAvailableTo, isPurchasable, type SalesProduct } from '@dimol/shared';
import { AppButton, Card } from '../../components/ui';
import { usePaymentConfig } from '../../lib/payment-config';
import { useSession } from '../../navigation';
import { theme } from '../../theme';
import { ProductDetails } from './ProductDetails';
import type { StoreCheckoutState } from './useStoreCheckout';

/**
 * 상품 카드 — 상품 정보([[ProductDetails]]) + 결제 버튼.
 *
 * 일반결제 상품은 일반결제창, 월 정기결제 상품은 정기결제창으로 간다([[useStoreCheckout]]).
 * 대상 회원이 아니거나(예: 철거업체 전용) 정기결제 채널이 아직 없으면 버튼 대신 이유를 보여준다.
 */
export function ProductCard({
  product,
  store,
}: {
  product: SalesProduct;
  store: StoreCheckoutState;
}) {
  const user = useSession();
  const billingEnabled = Boolean(usePaymentConfig().billingChannelKey);
  const subscription = store.activeSubscriptionOf(product.id);
  const monthly = product.billingType === 'MONTHLY_SUBSCRIPTION';
  const eligible = isAvailableTo(product, user.userType);
  const purchasable = isPurchasable(product, { billingEnabled });

  return (
    <Card>
      <ProductDetails product={product} />
      <View style={styles.actions}>
        {!eligible && !subscription ? (
          <Text style={styles.blocked}>철거업체 회원만 구매할 수 있는 상품이에요.</Text>
        ) : !purchasable && !subscription ? (
          <Text style={styles.blocked}>
            정기결제 준비 중입니다. 결제가 열리면 바로 구독할 수 있어요.
          </Text>
        ) : !monthly ? (
          <>
            {store.passUntil(product.id) ? (
              <Text style={styles.subState}>
                이용 중 · {store.passUntil(product.id)}까지 (다시 결제하면 30일이 이어져요)
              </Text>
            ) : null}
            <AppButton
              label="결제하기"
              loading={store.busyId === product.id}
              onPress={() => store.startOneTime(product)}
            />
          </>
        ) : subscription ? (
          <>
            <Text style={styles.subState}>
              구독 중 · 다음 결제일 {subscription.nextBillingDate}
              {subscription.status === 'PAYMENT_FAILED'
                ? ' (결제 실패 — 카드를 확인해 주세요)'
                : ''}
            </Text>
            <AppButton
              label="구독 해지"
              variant="outline"
              loading={store.busyId === subscription.id}
              onPress={() => void store.cancel(subscription)}
            />
          </>
        ) : (
          <AppButton
            label="정기결제 등록"
            loading={store.busyId === product.id}
            onPress={() => store.startSubscription(product)}
          />
        )}
      </View>
    </Card>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  actions: { marginTop: spacing.sm },
  blocked: { color: colors.textMuted, fontSize: font.body, fontWeight: '700' },
  subState: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
});
