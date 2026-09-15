import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SalesProduct } from '@dimol/shared';
import { AppButton, Card } from '../../components/ui';
import { won } from '../../lib/format';
import { theme } from '../../theme';
import type { StoreCheckoutState } from './useStoreCheckout';

/**
 * 상품 카드 — 일반결제 상품과 월 정기결제 상품.
 *
 * 화면이 반드시 보여줘야 하는 것(PG 심사 필수 항목):
 *  - 일반결제: **서비스 제공기간**(결제 후 완료까지).
 *  - 정기결제: 결제 주기(월 1회)와 **해지 방법**.
 * 이 문구들은 장식이 아니라 요건이라, 빼거나 접어 두지 않는다.
 */
export function ProductCard({
  product,
  store,
}: {
  product: SalesProduct;
  store: StoreCheckoutState;
}) {
  const subscription = store.activeSubscriptionOf(product.id);
  const monthly = product.billingType === 'MONTHLY_SUBSCRIPTION';

  return (
    <Card>
      <Text style={styles.name}>{product.name}</Text>
      <Text style={styles.price}>
        {won(product.price)}
        {monthly ? ' / 월' : ''}
      </Text>
      <Text style={styles.description}>{product.description}</Text>

      {product.benefits.map((benefit) => (
        <Text key={benefit} style={styles.benefit}>
          · {benefit}
        </Text>
      ))}

      {!monthly ? (
        <>
          <View style={styles.terms}>
            <Text style={styles.termsLabel}>서비스 제공기간</Text>
            <Text style={styles.termsValue}>{product.servicePeriod.label}</Text>
          </View>
          <AppButton
            label="결제하기"
            loading={store.busyId === product.id}
            onPress={() => store.startOneTime(product)}
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
          {subscription ? (
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
        </>
      )}
    </Card>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  name: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800' },
  price: {
    color: colors.primary,
    fontSize: font.title,
    fontWeight: '800',
    marginTop: spacing.xs / 2,
  },
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
