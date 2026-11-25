import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  DEMOLITION_MEMBERSHIP_ID,
  PASS_REFUND_WINDOW_DAYS,
  USER_TYPE_LABELS,
  type SalesProduct,
} from '@dimol/shared';
import { WEB_BASE_URL } from '../../api/client';
import { TABULAR_NUMS, manwon, won } from '../../lib/format';
import { useWideLayout } from '../../lib/layout';
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
  const wide = useWideLayout();

  return (
    <View style={wide ? styles.cols : undefined}>
      <View style={wide ? styles.colMain : undefined}>
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
        <Text style={styles.name} accessibilityRole="header">
          {product.name}
        </Text>
        <Text style={[styles.price, TABULAR_NUMS]}>{won(product.price)}</Text>
        {monthly ? (
          <Text style={styles.perDay}>매월 결제</Text>
        ) : days ? (
          <Text style={styles.perDay}>
            {days}일 이용 · 하루 약 {won(dailyPrice(product.price, days))}
          </Text>
        ) : null}

        {actions ? <View style={styles.actions}>{actions}</View> : null}

        {!monthly ? (
          <Text style={styles.reassure}>
            자동 결제 없음 · {PASS_REFUND_WINDOW_DAYS}일 안에 혜택을 안 쓰면 전액 환불
          </Text>
        ) : null}
      </View>

      <View style={[styles.table, wide && styles.tableWide]}>
        <Row label="이용권 혜택">
          {product.benefits.map((benefit) => `· ${benefit}`).join('\n')}
        </Row>
        {breakEven !== null ? (
          <Row label="수수료 절감">
            {`정산 ${manwon(EXAMPLE_SETTLEMENT)} 기준 ${manwon(feeSavings(EXAMPLE_SETTLEMENT))} 절감 (정산 ${manwonExact(breakEven)}만 이상이면 이용권 값 이상)`}
          </Row>
        ) : null}
        <Row label="상품 설명">{product.description}</Row>
        <Row label="서비스 제공기간">{product.servicePeriod.label}</Row>
        {monthly ? (
          <>
            <Row label="결제 주기">매월 1회 자동결제 (월 단위)</Row>
            <Row label="해지 방법">{product.cancellationNotice}</Row>
          </>
        ) : null}
        <Row label="제공 방식">{product.delivery}</Row>
        <Row label="환불 정책">
          {product.refundPolicy.map((rule) => `· ${rule}`).join('\n')}
        </Row>
      </View>
    </View>
  );
}

/** 안내표 한 줄 — 왼쪽 라벨 칸 | 오른쪽 내용. 좁은 화면에서는 위아래로 쌓인다. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const wide = useWideLayout();
  return (
    <View style={[styles.row, wide && styles.rowWide]}>
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

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  cols: { flexDirection: 'row', gap: spacing.lg },
  colMain: { flex: 4 },
  image: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    height: 160,
    marginBottom: spacing.sm,
    width: 160,
  },
  audience: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  name: {
    color: colors.text,
    fontSize: font.title,
    letterSpacing: theme.tracking.title,
    fontWeight: '700',
    lineHeight: 32,
    marginTop: spacing.xs / 2,
  },
  price: {
    color: colors.text,
    fontSize: font.display,
    letterSpacing: theme.tracking.display,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  perDay: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
  actions: { marginTop: spacing.md },
  reassure: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
  // 공문서 안내표 — 위는 진한 선, 줄마다 옅은 선.
  table: {
    borderTopColor: colors.text,
    borderTopWidth: 2,
    marginTop: spacing.md,
  },
  tableWide: { flex: 7, marginTop: 0 },
  row: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: spacing.sm,
  },
  rowWide: { flexDirection: 'row' },
  label: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.xs / 2,
  },
  labelWide: { marginBottom: 0, width: 160 },
  value: {
    color: colors.text,
    flex: 1,
    fontSize: font.body,
    lineHeight: font.body * 1.5,
  },
});
