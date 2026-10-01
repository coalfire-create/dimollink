import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { USER_TYPE_LABELS, type SalesProduct } from '@dimol/shared';
import { WEB_BASE_URL } from '../../api/client';
import { won } from '../../lib/format';
import { theme } from '../../theme';

/**
 * 상품 정보 본문 — 스토어(결제)와 로그인 전 첫 화면(소개)이 같이 쓴다.
 *
 * PG 심사 필수 항목이라 장식이 아니다. 빼거나 접어 두지 않는다:
 *  - 상품 **이미지·금액·상세**
 *  - **서비스 제공기간**, 제공 방식(배송 규정), **환불 정책**
 *  - 정기결제: 결제 주기(월 1회)와 **해지 방법**
 */
export function ProductDetails({ product }: { product: SalesProduct }) {
  const monthly = product.billingType === 'MONTHLY_SUBSCRIPTION';
  return (
    <View>
      <Image
        source={{ uri: `${WEB_BASE_URL}${product.imagePath}` }}
        style={styles.image}
        resizeMode="cover"
        accessibilityLabel={`${product.name} 상품 이미지`}
      />
      {product.availableTo ? (
        <Text style={styles.audience}>
          {product.availableTo.map((t) => USER_TYPE_LABELS[t]).join('·')} 전용
        </Text>
      ) : null}
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

      <View style={styles.terms}>
        <Text style={styles.termsLabel}>서비스 제공기간</Text>
        <Text style={styles.termsValue}>{product.servicePeriod.label}</Text>
        {monthly ? (
          <>
            <Text style={styles.termsLabel}>결제 주기</Text>
            <Text style={styles.termsValue}>매월 1회 자동결제 (월 단위)</Text>
            <Text style={styles.termsLabel}>해지 방법</Text>
            <Text style={styles.termsValue}>{product.cancellationNotice}</Text>
          </>
        ) : null}
        <Text style={styles.termsLabel}>제공 방식</Text>
        <Text style={styles.termsValue}>{product.delivery}</Text>
        <Text style={styles.termsLabel}>환불 정책</Text>
        {product.refundPolicy.map((rule) => (
          <Text key={rule} style={styles.termsValue}>
            · {rule}
          </Text>
        ))}
      </View>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  image: {
    alignSelf: 'center',
    aspectRatio: 1,
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    marginBottom: spacing.sm,
    maxWidth: 320,
    width: '100%',
  },
  audience: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
    marginBottom: spacing.xs / 2,
  },
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
  termsLabel: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '700',
    marginTop: spacing.xs / 2,
  },
  termsValue: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: font.body * 1.5,
  },
});
