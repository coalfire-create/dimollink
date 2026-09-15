import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  ASBESTOS_RISK_LABELS,
  asbestosRisk,
  ledgerDisplayRows,
  type BuildingLedgerInfo,
} from '@dimol/shared';
import { theme } from '../../theme';
import type { LedgerState } from '../../lib/useBuildingLedger';

/**
 * 건축물대장 확인 결과 — 촬영 전에 "이 건물이 무엇인지"를 보여준다.
 *
 * 요청 폼의 같은 카드보다 문구가 짧다. 거기서는 이 값이 폼을 채우지만
 * 여기서는 분석의 기준으로만 쓰이기 때문이다(고쳐 넣을 칸이 없다).
 */
export function LedgerPanel({
  state,
  info,
}: {
  state: LedgerState;
  info: BuildingLedgerInfo | null;
}) {
  if (state === 'idle') return null;

  if (state === 'loading') {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>건축물대장 확인 중…</Text>
      </View>
    );
  }

  if (state === 'none' || !info) {
    return (
      <View style={[styles.card, styles.cardMuted]}>
        <Text style={styles.title}>건축물대장 정보를 찾지 못했어요</Text>
        <Text style={styles.body}>
          미등기·무허가 건물이거나 지번이 정확하지 않을 수 있어요. 촬영은 그대로 진행할 수 있어요.
        </Text>
      </View>
    );
  }

  const risk = asbestosRisk(info);

  return (
    <View style={styles.card}>
      <Text style={styles.badge}>공공데이터 확인</Text>
      <Text style={styles.title}>{info.bldNm ?? '건축물대장 표제부'}</Text>
      {ledgerDisplayRows(info).map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Text style={styles.rowValue}>{row.value}</Text>
        </View>
      ))}
      {risk === 'HIGH' || risk === 'POSSIBLE' ? (
        <View style={styles.warn}>
          <Text style={styles.warnTitle}>⚠️ {ASBESTOS_RISK_LABELS[risk]}</Text>
          <Text style={styles.warnBody}>
            철거 전 석면 사전조사가 필요하며, 사진 분석에도 이 사실이 함께 반영돼요.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  cardMuted: {
    backgroundColor: colors.surface,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 999,
    color: colors.background,
    fontSize: font.caption,
    fontWeight: '700',
    marginBottom: spacing.xs,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  title: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  body: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 24,
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '600',
  },
  rowValue: {
    color: colors.text,
    flexShrink: 1,
    fontSize: font.caption,
    fontWeight: '700',
    textAlign: 'right',
  },
  warn: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.card,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  warnTitle: {
    color: colors.warning,
    fontSize: font.caption,
    fontWeight: '700',
  },
  warnBody: {
    color: colors.warning,
    fontSize: font.caption,
    lineHeight: 24,
    marginTop: spacing.xs / 2,
  },
});
