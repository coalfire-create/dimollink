import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CANCELLATION_PENALTY_RATE, VIRTUAL_ACCOUNT_VALID_HOURS } from '@dimol/shared';
import { AppButton, IconTile, StickyFooter } from '../../components/ui';
import { FadeInUp } from '../../components/motion';
import { AppIcon, type IconName } from '../../components/AppIcon';
import { ScreenHeader } from '../../navigation';
import type { RequestPayMethod } from '../../lib/request-web-payment';
import { theme } from '../../theme';

export type PayMethod = RequestPayMethod;

const METHODS: { key: PayMethod; icon: IconName; title: string; hint: string; badge?: string }[] = [
  {
    key: 'VBANK',
    icon: 'building',
    title: '계좌이체',
    hint: `가상계좌 발급 · ${VIRTUAL_ACCOUNT_VALID_HOURS}시간 안에 입금`,
    badge: '추천',
  },
  { key: 'CARD', icon: 'card', title: '카드 결제', hint: '바로 결제하고 바로 확정' },
];

export function PaymentDoneView({
  payMethod,
  onConfirm,
}: {
  payMethod: PayMethod;
  onConfirm: () => void;
}) {
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
              ? `가상계좌가 발급됐어요. ${VIRTUAL_ACCOUNT_VALID_HOURS}시간 안에 입금하면 일정이 확정돼요.`
              : '카드 결제가 끝났어요. 작업일에 업체가 현장에 나가요.'}
          </Text>
        </FadeInUp>
      </View>
      <StickyFooter>
        <AppButton label="확인" onPress={onConfirm} />
      </StickyFooter>
    </View>
  );
}

export function PaymentRefundSummary() {
  return (
    <View style={styles.summary}>
      <SummaryRow label="결제 방식" value="선결제 · 추가 비용 없음" />
      <SummaryRow label="배차 전 취소" value="전액 환불" />
      <SummaryRow
        label="배차 후 ~ 작업 전"
        value={`위약금 ${Math.round(CANCELLATION_PENALTY_RATE * 100)}% 제외 환불`}
        last
      />
    </View>
  );
}

export function PaymentMethodSelector({
  payMethod,
  onSelect,
}: {
  payMethod: PayMethod;
  onSelect: (method: PayMethod) => void;
}) {
  return (
    <>
      <Text style={styles.methodTitle}>결제수단</Text>
      <View style={styles.methods} accessibilityRole="radiogroup">
        {METHODS.map((m, i) => {
          const selected = payMethod === m.key;
          return (
            <Pressable
              key={m.key}
              accessibilityRole="radio"
              accessibilityLabel={`${m.title}. ${m.hint}`}
              accessibilityState={{ checked: selected }}
              onPress={() => onSelect(m.key)}
              style={[styles.method, i > 0 && styles.methodDivided]}
            >
              <View style={[styles.radio, selected && styles.radioOn]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <IconTile icon={m.icon} size="sm" style={styles.methodIcon} />
              <View style={styles.methodText}>
                <View style={styles.methodTitleRow}>
                  <Text style={[styles.methodLabel, selected && styles.methodLabelOn]}>
                    {m.title}
                  </Text>
                  {m.badge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{m.badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.methodHint}>{m.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.trustRow}>
        <AppIcon name="lock" size={18} color={theme.colors.textMuted} filled />
        <Text style={styles.trustLine}>결제는 포트원(PortOne)이 안전하게 처리해요</Text>
      </View>
    </>
  );
}

function SummaryRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.summaryRow, !last && styles.summaryRowDivided]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  summaryRowDivided: { borderBottomColor: colors.border, borderBottomWidth: 1 },
  summaryLabel: { color: colors.textMuted, fontSize: font.body },
  summaryValue: {
    color: colors.text,
    flexShrink: 1,
    fontSize: font.body,
    fontWeight: '700',
    marginLeft: spacing.sm,
    textAlign: 'right',
  },
  methodTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  methods: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    paddingHorizontal: spacing.sm,
    ...theme.shadow.card,
  },
  method: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: theme.touch.primaryButtonHeight + spacing.md,
    paddingVertical: spacing.sm,
  },
  methodDivided: { borderTopColor: colors.border, borderTopWidth: 1 },
  radio: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 24,
  },
  radioOn: { borderColor: colors.primary },
  radioDot: { backgroundColor: colors.primary, borderRadius: radius.pill, height: 12, width: 12 },
  methodIcon: { marginRight: spacing.sm },
  methodText: { flex: 1 },
  methodTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  methodLabel: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '700' },
  methodLabelOn: { color: colors.primary, fontWeight: '800' },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
  },
  badgeText: { color: colors.background, fontSize: font.caption, fontWeight: '800' },
  methodHint: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.xs / 2 },
  trustRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  trustLine: { color: colors.textMuted, fontSize: font.body, fontWeight: '600' },
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
  doneTitle: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
    textAlign: 'center',
  },
  doneDesc: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
