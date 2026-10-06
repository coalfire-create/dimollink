import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as PortOne from '@portone/react-native-sdk';
import { BuyerEmailModal } from '../components/BuyerEmailModal';
import { Card, ErrorBanner, SectionTitle } from '../components/ui';
import { ScreenHeader } from '../navigation';
import { ProductCard } from './store/ProductCard';
import { useStoreCheckout } from './store/useStoreCheckout';
import { theme } from '../theme';

/**
 * 스토어 — 앱 안에서 실제로 결제되는 상품.
 *
 * 결제창(일반/정기)이 열려 있는 동안에는 이 화면을 아예 그리지 않는다. 결제창은
 * 전체화면 WebView 라서, 뒤에 화면이 남아 있으면 결제 도중 뒤로가기로 빠져나가
 * 결제는 진행 중인데 앱은 다른 화면인 상태가 만들어진다.
 *
 * 결제 흐름과 PG 심사 요건은 [[useStoreCheckout]] 과 [[ProductCard]] 에 있다.
 */
export function StoreScreen() {
  const store = useStoreCheckout();

  if (store.payRequest) {
    return (
      <PortOne.Payment
        request={store.payRequest}
        onComplete={store.onPaymentComplete}
        onError={(err: Error) => store.failCheckout(err.message || '결제창을 열지 못했어요.')}
      />
    );
  }

  if (store.billingRequest) {
    return (
      <PortOne.IssueBillingKey
        request={store.billingRequest}
        onComplete={store.onBillingKeyComplete}
        onError={(err: Error) => store.failCheckout(err.message || '정기결제창을 열지 못했어요.')}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="스토어" canGoBack />
      <ScrollView contentContainerStyle={styles.content}>
        <ErrorBanner message={store.error} />
        {store.notice ? <Text style={styles.notice}>{store.notice}</Text> : null}

        {store.products.map((product) => (
          <ProductCard key={product.id} product={product} store={store} />
        ))}

        {store.cancelledSubscriptions.length > 0 ? (
          <>
            <SectionTitle>해지한 구독</SectionTitle>
            {store.cancelledSubscriptions.map((subscription) => (
              <Card key={subscription.id}>
                <Text style={styles.cancelledText}>
                  {subscription.productId} · {subscription.currentPeriodEnd} 까지 이용 가능
                </Text>
              </Card>
            ))}
          </>
        ) : null}
      </ScrollView>
      <BuyerEmailModal {...store.emailPrompt} />
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.lg },
  notice: {
    backgroundColor: colors.primarySoft,
    borderRadius: 8,
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  cancelledText: {
    color: colors.textMuted,
    fontSize: font.body,
  },
});
