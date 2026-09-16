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
 * 건축물대장(공공데이터) 사전 확인 카드.
 *
 * "이 주소의 건물이 무엇인지"를 촬영 전에 사용자와 분석 양쪽에 먼저 보여준다.
 * 대장을 못 찾아도 촬영을 막지 않는다 — 미등기·무허가 건물이 실제로 많고,
 * 여기서 막으면 그 현장은 아예 접수를 못 한다.
 */
export function BuildingLedgerCard({
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
        <Text style={styles.body}>공공데이터에서 이 주소의 건물 정보를 불러오고 있어요.</Text>
      </View>
    );
  }

  if (state === 'none' || !info) {
    return (
      <View style={[styles.card, styles.cardMuted]}>
        <Text style={styles.title}>건축물대장 정보를 찾지 못했어요</Text>
        <Text style={styles.body}>
          미등기·무허가 건물이거나 지번이 정확하지 않을 수 있어요. 촬영은 그대로 진행할 수 있고,
          건물 종류·층수·면적을 직접 입력해 주시면 분석이 더 정확해져요.
        </Text>
      </View>
    );
  }

  const rows = ledgerDisplayRows(info);
  const risk = asbestosRisk(info);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.badge}>공공데이터 확인</Text>
        <Text style={styles.title}>{info.bldNm ?? '건축물대장 표제부'}</Text>
      </View>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Text style={styles.rowValue}>{row.value}</Text>
        </View>
      ))}
      {risk === 'HIGH' || risk === 'POSSIBLE' ? (
        <View style={styles.warn}>
          <Text style={styles.warnTitle}>⚠️ {ASBESTOS_RISK_LABELS[risk]}</Text>
          <Text style={styles.warnBody}>
            석면 함유 자재가 쓰였을 수 있는 시기·자재예요. 철거 전 석면 사전조사가 필요하며,
            디몰비전 분석에도 이 사실이 함께 반영돼요.
          </Text>
        </View>
      ) : null}
      <Text style={styles.foot}>
        이 정보를 기준으로 사진을 분석해 철거 공정을 안내해요. 실제와 다르면 아래에서 직접 고칠 수
        있어요.
      </Text>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardMuted: {
    backgroundColor: colors.surface,
  },
  header: {
    marginBottom: spacing.sm,
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
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '600',
    flexShrink: 0,
    marginRight: spacing.sm,
  },
  rowValue: {
    color: colors.text,
    flex: 1,
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
  foot: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 24,
    marginTop: spacing.sm,
  },
});
