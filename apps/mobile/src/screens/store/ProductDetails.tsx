import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  DEMOLITION_MEMBERSHIP_ID,
  PASS_REFUND_WINDOW_DAYS,
  USER_TYPE_LABELS,
  type SalesProduct,
} from '@dimol/shared';
import { WEB_BASE_URL } from '../../api/client';
import type { IconName } from '../../components/AppIcon';
import { IconTile } from '../../components/ui';
import { manwon, won } from '../../lib/format';
import { breakEvenSettlement, dailyPrice, feeSavings } from '../../lib/membership-value';
import { theme } from '../../theme';

/**
 * 상품 정보 본문 — 스토어(결제)와 로그인 전 첫 화면(소개)이 같이 쓴다.
 *
 * PG 심사 필수 항목이라 장식이 아니다. 빼거나 접어 두지 않는다:
 *  - 상품 **이미지·금액·상세**
 *  - **서비스 제공기간**, 제공 방식(배송 규정), **환불 정책**
 *  - 정기결제: 결제 주기(월 1회)와 **해지 방법**
 *
 * 순서는 "사고 싶게" 짰다 — 무엇·얼마(대표 영역) → 내 돈으로 얼마나 이득인지 → 혜택 →
 * 결제 버튼 → 안심 문구 → 꼭 확인할 약관. 예전에는 큰 그림 아래 긴 설명 문단이 먼저 나와
 * 정작 "왜 사야 하는지"가 문단 속에 묻혀 있었다.
 */
const EXAMPLE_SETTLEMENT = 10_000_000;

/** 혜택 문구 → 아이콘. 상품 정의(공유)는 글만 갖고, 모양은 화면이 고른다. */
function benefitIcon(text: string): IconName {
  if (text.includes('알림')) return 'notifications';
  if (text.includes('수수료')) return 'card';
  if (text.includes('노출') || text.includes('상단')) return 'star';
  return 'check';
}

export function ProductDetails({
  product,
  actions,
}: {
  product: SalesProduct;
  /**
   * 결제 버튼 자리 — 혜택 바로 아래, 약관 위. 약관(제공기간·환불)은 PG 심사상 상품
   * 화면에 늘 보여야 해서 접지 않는 대신, 버튼을 약관 아래 끝에서 위로 올렸다.
   */
  actions?: React.ReactNode;
}) {
  const monthly = product.billingType === 'MONTHLY_SUBSCRIPTION';
  const days = product.billingType === 'ONE_TIME' ? product.grantsDays : undefined;
  const isMembership = product.id === DEMOLITION_MEMBERSHIP_ID;
  const breakEven = isMembership ? breakEvenSettlement(product.price) : null;

  return (
    <View>
      {/* 대표 영역 — 누구용·무엇·얼마. 한눈에 상품으로 읽히게 브랜드 색 바탕. */}
      <View style={styles.hero}>
        <View style={styles.heroText}>
          {product.availableTo ? (
            <View style={styles.audienceChip}>
              <Text style={styles.audienceText}>
                {product.availableTo.map((t) => USER_TYPE_LABELS[t]).join('·')} 전용
              </Text>
            </View>
          ) : null}
          <Text style={styles.name} accessibilityRole="header">
            {product.name}
          </Text>
          {/* 가격은 한 줄에 크게 — 기간·하루 가격은 아래 줄로(옆에 붙이면 좁은 폰에서 줄이 깨진다). */}
          <Text style={styles.price}>{won(product.price)}</Text>
          {monthly ? (
            <Text style={styles.perDay}>매월 결제</Text>
          ) : days ? (
            <Text style={styles.perDay}>
              {days}일 · 하루 약 {won(dailyPrice(product.price, days))}
            </Text>
          ) : null}
        </View>
        <Image
          source={{ uri: `${WEB_BASE_URL}${product.imagePath}` }}
          style={styles.image}
          resizeMode="cover"
          accessibilityLabel={`${product.name} 상품 이미지`}
        />
      </View>

      {/* 혜택을 내 돈으로 — 수수료 인하가 얼마인지 대신 계산해 준다([[membership-value]]). */}
      {breakEven !== null ? (
        <View style={styles.value}>
          <Text style={styles.valueTitle}>정산 {manwonExact(breakEven)}만 넘어도 본전이에요</Text>
          <Text style={styles.valueBody}>
            철거 1건 정산이 {manwon(EXAMPLE_SETTLEMENT)}이면 수수료를{' '}
            <Text style={styles.valueStrong}>{manwon(feeSavings(EXAMPLE_SETTLEMENT))}</Text>{' '}
            아껴요.
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>이용권 혜택</Text>
      {product.benefits.map((benefit) => (
        <View key={benefit} style={styles.benefitRow}>
          <IconTile icon={benefitIcon(benefit)} size="sm" style={styles.benefitIcon} />
          <Text style={styles.benefitText}>{benefit}</Text>
        </View>
      ))}

      {actions}

      {!monthly ? (
        <Text style={styles.reassure}>
          자동 결제 없음 · {PASS_REFUND_WINDOW_DAYS}일 안에 혜택을 안 쓰면 전액 환불
        </Text>
      ) : null}

      <View style={styles.terms}>
        <Text style={styles.termsTitle}>꼭 확인해 주세요</Text>
        <Text style={styles.termsLabel}>상품 설명</Text>
        <Text style={styles.termsValue}>{product.description}</Text>
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

/**
 * 만 원 아래까지 정확히 — 295,000 → "29만 5천 원". 손익분기처럼 반올림하면 뜻이 바뀌는 금액용.
 * (천 원 단위로 떨어지지 않으면 원 단위까지 적는다.)
 */
function manwonExact(value: number): string {
  const man = Math.floor(value / 10_000);
  const rest = value % 10_000;
  if (rest === 0) return `${man.toLocaleString('ko-KR')}만 원`;
  if (rest % 1_000 === 0) return `${man.toLocaleString('ko-KR')}만 ${rest / 1_000}천 원`;
  return won(value);
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    overflow: 'hidden',
    padding: spacing.md,
  },
  heroText: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  audienceChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  audienceText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '800',
  },
  name: {
    color: colors.background,
    fontSize: font.title,
    fontWeight: '800',
    lineHeight: 32,
  },
  price: {
    color: colors.background,
    fontSize: font.titleLarge + 4,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  perDay: {
    color: colors.background,
    fontSize: font.body,
    fontWeight: '600',
    marginTop: spacing.xs / 2,
    opacity: 0.9,
  },
  image: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.button,
    height: 96,
    width: 96,
  },
  value: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.button,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  valueTitle: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  valueBody: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: font.body * 1.5,
    marginTop: spacing.xs / 2,
  },
  valueStrong: {
    color: colors.primary,
    fontWeight: '800',
  },
  sectionLabel: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  benefitRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  benefitIcon: {
    marginRight: spacing.sm,
  },
  benefitText: {
    color: colors.text,
    flex: 1,
    fontSize: font.body,
    fontWeight: '600',
  },
  reassure: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  terms: {
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  termsTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    marginBottom: spacing.xs / 2,
  },
  termsLabel: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  termsValue: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: font.body * 1.5,
  },
});
