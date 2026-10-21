import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  MAX_SITE_VISITS_PER_REQUEST,
  type DemolitionEstimate,
  type ProviderEstimateAccuracy,
} from '@dimol/shared';
import { AppButton, AmountDisplay, Card, IconTile } from '../ui';
import { manwon, TABULAR_NUMS } from '../../lib/format';
import { VisitPicker } from './VisitPicker';
import { theme } from '../../theme';

export interface EstimateCardItemProps {
  estimate: DemolitionEstimate;
  index: number;
  accuracy: ProviderEstimateAccuracy | undefined;
  visitsLeft: number;
  visitAt: string | undefined;
  busy: boolean;
  onSelectVisitAt: (iso: string) => void;
  onAcceptFinal: () => void;
  onCancelVisit: () => void;
  onRequestVisit: () => void;
}

function accuracyLabel(acc: ProviderEstimateAccuracy | undefined): string | null {
  if (!acc || acc.sampleCount === 0) return null;
  if (acc.sampleCount < 3) return `실적 ${acc.sampleCount}건 · 참고용`;
  const pct = Math.round((acc.averageDeviation ?? 0) * 100);
  const sign = pct > 0 ? '+' : '';
  return `개산 대비 확정 평균 ${sign}${pct}% · ${acc.sampleCount}건`;
}

export function EstimateCardItem({
  estimate: e,
  index,
  accuracy,
  visitsLeft,
  visitAt,
  busy,
  onSelectVisitAt,
  onAcceptFinal,
  onCancelVisit,
  onRequestVisit,
}: EstimateCardItemProps) {
  const label = accuracyLabel(accuracy);
  const overrun = e.final !== undefined && e.final.amount > e.preliminary.maxAmount;
  const name = e.providerName ?? '철거업체';

  return (
    <Card key={e.id} style={e.final ? styles.cardFinal : undefined}>
      <View style={styles.providerRow}>
        <IconTile label={name.trim().charAt(0) || '철'} style={styles.providerIcon} />
        <View style={styles.flex}>
          <Text style={styles.provider}>{name}</Text>
          {label ? <Text style={styles.accuracy}>{label}</Text> : null}
        </View>
        {index === 0 && !e.final ? (
          <View style={styles.lowest}>
            <Text style={styles.lowestText}>최저 예상</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.rangeBox}>
        <Text style={styles.rangeLabel}>예상 범위 (실사 전)</Text>
        <Text style={styles.range}>
          {manwon(e.preliminary.minAmount)} ~ {manwon(e.preliminary.maxAmount)}
        </Text>
      </View>
      {e.preliminary.memo ? <Text style={styles.memo}>{e.preliminary.memo}</Text> : null}

      {e.final ? (
        <>
          <View style={styles.finalBox}>
            <Text style={styles.finalLabel}>확정 견적 (계약금액)</Text>
            <AmountDisplay value={e.final.amount} size="lg" color="primary" />
          </View>
          {overrun ? (
            <Text style={styles.overrun}>예상 범위를 넘었어요 — {e.final.overrunReason}</Text>
          ) : null}
          {e.final.memo ? <Text style={styles.memo}>{e.final.memo}</Text> : null}
          <AppButton
            label="이 견적으로 계약하기"
            style={styles.action}
            loading={busy}
            onPress={onAcceptFinal}
          />
        </>
      ) : e.visit ? (
        <>
          <View style={styles.visitBox}>
            <Text style={styles.visitLabel}>실사 예약</Text>
            <Text style={styles.visitValue}>
              {new Date(e.visit.scheduledAt).toLocaleString('ko-KR', {
                month: 'long',
                day: 'numeric',
                weekday: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
          </View>
          <Text style={styles.hint}>실사 후 업체가 확정 금액을 보내요.</Text>
          <AppButton
            label="실사 예약 취소"
            variant="outline"
            style={styles.action}
            loading={busy}
            onPress={onCancelVisit}
          />
        </>
      ) : (
        <>
          <VisitPicker value={visitAt} onChange={onSelectVisitAt} />
          <AppButton
            label={
              visitsLeft > 0 ? '현장 실사 요청하기' : `실사는 ${MAX_SITE_VISITS_PER_REQUEST}곳까지예요`
            }
            style={styles.action}
            loading={busy}
            disabled={visitsLeft <= 0 || !visitAt}
            disabledReason={
              visitsLeft <= 0
                ? `실사 예약 한도(${MAX_SITE_VISITS_PER_REQUEST}곳)를 초과했습니다`
                : !visitAt
                  ? '희망하는 실사 일시를 선택해 주세요'
                  : undefined
            }
            onPress={onRequestVisit}
          />
        </>
      )}
    </Card>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  cardFinal: { borderColor: colors.primary, borderWidth: 2 },
  providerRow: { alignItems: 'center', flexDirection: 'row' },
  providerIcon: { marginRight: spacing.sm },
  flex: { flex: 1 },
  provider: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800' },
  accuracy: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
    marginTop: spacing.xs / 2,
  },
  lowest: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  lowestText: { color: colors.primary, fontSize: font.caption, fontWeight: '800' },
  rangeBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  rangeLabel: { color: colors.textMuted, fontSize: font.body },
  range: {
    ...TABULAR_NUMS,
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    marginTop: spacing.xs / 2,
  },
  finalBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.button,
    marginTop: spacing.xs,
    padding: spacing.sm,
  },
  finalLabel: { color: colors.primary, fontSize: font.body, fontWeight: '700' },
  overrun: {
    color: colors.error,
    fontSize: font.body,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  memo: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 26,
    marginTop: spacing.xs,
  },
  visitBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    marginTop: spacing.xs,
    padding: spacing.sm,
  },
  visitLabel: { color: colors.textMuted, fontSize: font.body },
  visitValue: {
    ...TABULAR_NUMS,
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    marginTop: spacing.xs / 2,
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
  action: { marginTop: spacing.sm },
});
