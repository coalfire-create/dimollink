import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SALES_PRODUCTS, isPurchasable, type SalesProduct } from '@dimol/shared';
import { listProducts } from '../../api/client';
import { AppButton, Card } from '../../components/ui';
import { usePaymentConfig } from '../../lib/payment-config';
import { theme } from '../../theme';
import { ProductDetails } from './ProductDetails';

/**
 * 로그인 전 화면(첫 화면·둘러보기)에 띄우는 판매 상품 안내.
 *
 * PG(토스페이먼츠) 심사는 "홈페이지에 판매 상품이 1개 이상 노출"되기를 요구한다. 앱의
 * 첫 화면이 곧 홈페이지라, 로그인하지 않아도 상품·가격·환불 정책을 볼 수 있어야 한다.
 * 구매(결제)는 사람에게 귀속돼야 하므로 버튼은 로그인으로 보낸다.
 *
 * 목록은 서버가 정하고, 조회가 실패하면 앱에 들어 있는 상품 정의를 그대로 보여준다.
 * 정기결제는 PG 자동결제(빌링) 채널이 열리기 전까지 "준비 중"으로 안내한다.
 */
export function ProductShowcase({ onBuy }: { onBuy: () => void }) {
  const [products, setProducts] = useState<SalesProduct[]>(() => [...SALES_PRODUCTS]);
  const billingEnabled = Boolean(usePaymentConfig().billingChannelKey);

  useEffect(() => {
    let alive = true;
    listProducts()
      .then((next) => {
        if (alive && next.length > 0) setProducts(next);
      })
      .catch(() => {
        // 기본 목록으로 계속 보여준다.
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View>
      <Text style={styles.title}>상품·요금 안내</Text>
      <Text style={styles.lead}>대상 회원은 가입 후 앱·웹에서 바로 결제할 수 있습니다.</Text>
      {products.map((product) => (
        <Card key={product.id}>
          <ProductDetails product={product} />
          <View style={styles.action}>
            {isPurchasable(product, { billingEnabled }) ? (
              <AppButton
                label={
                  product.billingType === 'MONTHLY_SUBSCRIPTION'
                    ? '로그인하고 구독하기'
                    : '로그인하고 구매하기'
                }
                onPress={onBuy}
              />
            ) : (
              <Text style={styles.pending}>
                정기결제 준비 중입니다. 결제가 열리면 앱에서 바로 구독할 수 있어요.
              </Text>
            )}
          </View>
        </Card>
      ))}
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: font.title, fontWeight: '800' },
  lead: {
    color: colors.textMuted,
    fontSize: font.body,
    marginBottom: spacing.sm,
    marginTop: spacing.xs / 2,
  },
  action: { marginTop: spacing.sm },
  pending: { color: colors.textMuted, fontSize: font.body, fontWeight: '700' },
});
