import React from 'react';
import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import {
  DEMOLITION_MEMBERSHIP_ID,
  MEMBER_PLATFORM_FEE_RATE,
  PASS_REFUND_WINDOW_DAYS,
  PLATFORM_FEE_RATE,
  USER_TYPE_LABELS,
  type SalesProduct,
} from '@dimol/shared';
import { TABULAR_NUMS, manwon, won } from '../../lib/format';
import { useWideLayout } from '../../lib/layout';
import { breakEvenSettlement, dailyPrice, feeSavings } from '../../lib/membership-value';
import { theme } from '../../theme';

/**
 * 상품 정보 본문 — 스토어(결제)와 로그인 전 첫 화면(소개)이 같이 쓴다.
 *
 * PG 심사 필수 항목이라 장식이 아니다. 빼거나 접어 두지 않는다:
 *  - 상품 **이미지(아래 멤버십 카드 그림)·금액·상세**
 *  - **서비스 제공기간**, 제공 방식(배송 규정), **환불 정책**
 *  - 정기결제: 결제 주기(월 1회)와 **해지 방법**
 *
 * "사고 싶게": 왼쪽은 카드 그림·가격·구매 버튼(넓은 화면에서는 스크롤을 따라온다),
 * 오른쪽은 내 돈으로 얼마 아끼는지(비교표) → 혜택 → 꼭 확인할 약관 순서.
 */
const EXAMPLE_SETTLEMENT = 10_000_000;

const pct = (rate: number) => `${Math.round(rate * 100)}%`;
const fee = (amount: number, rate: number) => Math.round(amount * rate);

export function ProductDetails({
  product,
  actions,
}: {
  product: SalesProduct;
  /** 결제 버튼 자리 — 가격 바로 아래. */
  actions?: React.ReactNode;
}) {
  const monthly = product.billingType === 'MONTHLY_SUBSCRIPTION';
  const days = product.billingType === 'ONE_TIME' ? product.grantsDays : undefined;
  const isMembership = product.id === DEMOLITION_MEMBERSHIP_ID;
  const breakEven = isMembership ? breakEvenSettlement(product.price) : null;
  const wide = useWideLayout();
  const audience = product.availableTo
    ? `${product.availableTo.map((t) => USER_TYPE_LABELS[t]).join('·')} 전용`
    : null;

  return (
    <View style={wide ? styles.cols : undefined}>
      <View style={wide ? [styles.colBuy, Platform.OS === 'web' && WEB_STICKY] : undefined}>
        <ProductVisual
          name={product.name}
          audience={audience}
          headline={isMembership ? `수수료 ${pct(MEMBER_PLATFORM_FEE_RATE)}` : product.name}
          period={days ? `${days}일` : monthly ? '매월' : null}
        />

        <Text style={styles.name} accessibilityRole="header">
          {product.name}
        </Text>
        <Text style={[styles.price, TABULAR_NUMS]}>{won(product.price)}</Text>
        {monthly ? (
          <Text style={styles.perDay}>매월 결제</Text>
        ) : days ? (
          <Text style={styles.perDay}>
            {days}일 이용 · 하루 {won(dailyPrice(product.price, days))}꼴
          </Text>
        ) : null}

        {actions ? <View style={styles.actions}>{actions}</View> : null}

        {!monthly ? (
          <Text style={styles.reassure}>
            자동 결제 없음 · {PASS_REFUND_WINDOW_DAYS}일 안에 안 쓰면 전액 환불
          </Text>
        ) : null}
      </View>

      <View style={wide ? styles.colInfo : styles.infoNarrow}>
        {breakEven !== null ? (
          <View style={styles.box}>
            <Text style={styles.boxCaption}>정산 {manwon(EXAMPLE_SETTLEMENT)}이면</Text>
            <CompareRow
              label={`일반 수수료 ${pct(PLATFORM_FEE_RATE)}`}
              value={won(fee(EXAMPLE_SETTLEMENT, PLATFORM_FEE_RATE))}
              muted
            />
            <CompareRow
              label={`멤버십 수수료 ${pct(MEMBER_PLATFORM_FEE_RATE)}`}
              value={won(fee(EXAMPLE_SETTLEMENT, MEMBER_PLATFORM_FEE_RATE))}
            />
            <View style={styles.divider} />
            <View style={styles.saveRow}>
              <Text style={styles.saveLabel}>아끼는 돈</Text>
              <Text style={[styles.saveValue, TABULAR_NUMS]}>
                {won(feeSavings(EXAMPLE_SETTLEMENT))}
              </Text>
            </View>
            <Text style={styles.boxNote}>
              정산 {manwonExact(breakEven)}만 넘어도 이용권 값은 뽑아요.
            </Text>
          </View>
        ) : null}

        <View style={styles.box}>
          <Text style={styles.boxTitle}>이용권 혜택</Text>
          {product.benefits.map((benefit, i) => (
            <View key={benefit} style={styles.benefitRow}>
              <Text style={[styles.benefitNo, TABULAR_NUMS]}>{i + 1}</Text>
              <Text style={styles.benefitText}>{benefit}</Text>
            </View>
          ))}
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>꼭 확인해 주세요</Text>
          <Row label="상품 설명">{product.description}</Row>
          <Row label="서비스 제공기간">{product.servicePeriod.label}</Row>
          {monthly ? (
            <>
              <Row label="결제 주기">매월 1회 자동결제 (월 단위)</Row>
              <Row label="해지 방법">{product.cancellationNotice}</Row>
            </>
          ) : null}
          <Row label="제공 방식">{product.delivery}</Row>
          <Row label="환불 정책" last>
            {product.refundPolicy.map((rule) => `· ${rule}`).join('\n')}
          </Row>
        </View>
      </View>
    </View>
  );
}

/**
 * 상품 그림 — 사진 대신 화면에서 그린 멤버십 카드. 파란 면 위에 핵심 숫자 하나만.
 * PG 심사의 "상품 이미지" 자리라 이미지 역할(accessibilityRole)을 준다.
 */
function ProductVisual({
  name,
  audience,
  headline,
  period,
}: {
  name: string;
  audience: string | null;
  headline: string;
  period: string | null;
}) {
  return (
    <View style={styles.visual} accessibilityRole="image" accessibilityLabel={`${name} 상품 이미지`}>
      <Text style={styles.visualBrand}>비움 멤버십</Text>
      <Text style={styles.visualHeadline}>{headline}</Text>
      <View style={styles.visualFoot}>
        <Text style={styles.visualMeta}>{audience ?? ''}</Text>
        {period ? <Text style={styles.visualPeriod}>{period}</Text> : null}
      </View>
    </View>
  );
}

function CompareRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.compareRow}>
      <Text style={[styles.compareLabel, muted && styles.mutedText]}>{label}</Text>
      <Text style={[styles.compareValue, TABULAR_NUMS, muted && styles.compareValueMuted]}>
        {value}
      </Text>
    </View>
  );
}

/** 약관 한 줄 — 넓은 화면은 라벨 | 내용, 좁은 화면은 위아래. */
function Row({
  label,
  last,
  children,
}: {
  label: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  const wide = useWideLayout();
  return (
    <View style={[styles.row, wide && styles.rowWide, last && styles.rowLast]}>
      <Text style={[styles.label, wide && styles.labelWide]}>{label}</Text>
      <Text style={styles.value}>{children}</Text>
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

/** 넓은 화면에서 구매 영역이 스크롤을 따라오게 — 약관을 읽는 동안에도 버튼이 보인다. */
const WEB_STICKY = { position: 'sticky', top: spacing.lg * 3 } as unknown as ViewStyle;

const styles = StyleSheet.create({
  cols: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.lg },
  colBuy: { flex: 5 },
  colInfo: { flex: 7, gap: spacing.sm },
  infoNarrow: { gap: spacing.sm, marginTop: spacing.lg },

  visual: {
    aspectRatio: 1.6,
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    justifyContent: 'space-between',
    padding: spacing.md,
    width: '100%',
  },
  visualBrand: { color: colors.primarySoft, fontSize: font.body, fontWeight: '700' },
  visualHeadline: {
    color: colors.background,
    fontSize: font.hero,
    fontWeight: '800',
    letterSpacing: theme.tracking.display * 1.5,
  },
  visualFoot: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  visualMeta: { color: colors.primarySoft, fontSize: font.body, fontWeight: '600' },
  visualPeriod: { color: colors.background, fontSize: font.title, fontWeight: '800' },

  name: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '700',
    letterSpacing: theme.tracking.title,
    lineHeight: 32,
    marginTop: spacing.md,
  },
  price: {
    color: colors.text,
    fontSize: font.display + 4,
    fontWeight: '800',
    letterSpacing: theme.tracking.display,
    marginTop: spacing.xs / 2,
  },
  perDay: { color: colors.primary, fontSize: font.body, fontWeight: '700', marginTop: spacing.xs / 2 },
  actions: { marginTop: spacing.md },
  reassure: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.xs, textAlign: 'center' },

  box: { backgroundColor: colors.background, borderRadius: radius.card, padding: spacing.md },
  boxCaption: { color: colors.textMuted, fontSize: font.body, fontWeight: '600', marginBottom: spacing.xs },
  boxTitle: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800', marginBottom: spacing.xs },
  boxNote: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.sm },

  compareRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs / 2,
  },
  compareLabel: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '600' },
  compareValue: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '700' },
  compareValueMuted: { color: colors.textMuted, fontWeight: '500', textDecorationLine: 'line-through' },
  mutedText: { color: colors.textMuted },
  divider: { backgroundColor: colors.border, height: 1, marginVertical: spacing.xs },
  saveRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  saveLabel: { color: colors.text, fontSize: font.title, fontWeight: '800' },
  saveValue: {
    color: colors.primary,
    fontSize: font.display,
    fontWeight: '800',
    letterSpacing: theme.tracking.display,
  },

  benefitRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  benefitNo: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '800',
    height: 32,
    lineHeight: 32,
    textAlign: 'center',
    width: 32,
  },
  benefitText: { color: colors.text, flex: 1, fontSize: font.bodyLarge, fontWeight: '600' },

  row: { borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: spacing.sm },
  rowWide: { flexDirection: 'row' },
  rowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  label: { color: colors.textMuted, fontSize: font.body, fontWeight: '700', marginBottom: spacing.xs / 2 },
  labelWide: { marginBottom: 0, width: 144 },
  value: { color: colors.text, flex: 1, fontSize: font.body, lineHeight: font.body * 1.5 },
});
