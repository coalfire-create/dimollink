import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  ASBESTOS_RISK_LABELS,
  BUILDING_TYPE_LABELS,
  DEMOLITION_TYPE_LABELS,
  asbestosRisk,
  hasLedgerData,
  ledgerDisplayRows,
  type DemolitionDetails,
  type FloorAreaBasis,
} from '@dimol/shared';
import { AppIcon } from '../AppIcon';
import { Card, SectionTitle } from '../ui';
import { theme } from '../../theme';

/**
 * 현장 브리핑 — 업체가 금액을 부르기 전에 "이 현장이 무엇인지" 한 번에 보는 카드.
 *
 * 이 정보들은 전부터 요청에 들어 있었는데 화면에 안 나왔다. 업체는 주소·톤수·날짜만
 * 보고 금액을 불러야 했고, 그래서 현장에 가서야 조건을 알고 금액이 뒤집혔다.
 * 순서는 **금액을 흔드는 순서**다 — 석면 → 구조·연면적 → 진입 조건 → 나머지.
 */

function boolLabel(value: boolean | undefined, yes: string, no: string): string | null {
  if (value === undefined) return null;
  return value ? yes : no;
}

export function SiteBriefCard({
  details,
  area,
  siteAddress,
  distanceKm,
}: {
  details: DemolitionDetails | undefined;
  area: FloorAreaBasis | null;
  siteAddress: string;
  distanceKm?: number | null;
}) {
  const ledger = details?.buildingLedger;
  const risk = asbestosRisk(ledger);
  const riskIsReal = risk === 'HIGH' || risk === 'POSSIBLE';

  const conditions: { label: string; value: string }[] = [];
  if (details?.buildingType) {
    conditions.push({ label: '건물 종류', value: BUILDING_TYPE_LABELS[details.buildingType] });
  }
  if (details?.demolitionType) {
    conditions.push({ label: '철거 범위', value: DEMOLITION_TYPE_LABELS[details.demolitionType] });
  }
  const elevator = boolLabel(details?.hasElevator, '있음', '없음');
  if (elevator) conditions.push({ label: '엘리베이터', value: elevator });
  const access = boolLabel(details?.hasVehicleAccess, '가능', '불가');
  if (access) conditions.push({ label: '차량·사다리차 진입', value: access });
  if (details?.desiredDate) conditions.push({ label: '희망 일정', value: details.desiredDate });

  return (
    <View>
      <SectionTitle>현장 브리핑</SectionTitle>

      {/* 석면은 비용·기간·인허가를 동시에 바꾼다 — 카드 맨 위에 둔다. */}
      {riskIsReal ? (
        <View style={styles.asbestos}>
          <AppIcon name="alert" size={20} color={colors.warning} />
          <View style={styles.asbestosText}>
            <Text style={styles.asbestosTitle}>{ASBESTOS_RISK_LABELS[risk]}</Text>
            <Text style={styles.asbestosBody}>
              철거 전 석면조사와 해체 신고가 필요할 수 있습니다. 조사·처리 비용과 기간을 견적에
              반영하세요.
            </Text>
          </View>
        </View>
      ) : null}

      <Card>
        <Text style={styles.address}>{siteAddress}</Text>
        {distanceKm != null ? (
          <View style={styles.distanceRow}>
            <AppIcon name="location" size={18} color={colors.textMuted} />
            <Text style={styles.distance}>현재 위치에서 약 {distanceKm}km</Text>
          </View>
        ) : null}

        {/* 연면적은 견적의 분모다 — 어디서 온 값인지까지 같이 보여준다. */}
        <View style={styles.areaBox}>
          <Text style={styles.areaLabel}>견적 기준 연면적</Text>
          {area ? (
            <>
              <Text style={styles.areaValue}>{area.m2.toLocaleString('ko-KR')}㎡</Text>
              <Text style={styles.areaNote}>{area.note}</Text>
            </>
          ) : (
            <Text style={styles.areaMissing}>면적 근거가 없습니다 — 실사에서 직접 확인하세요.</Text>
          )}
        </View>

        {conditions.length > 0 ? (
          <View style={styles.rows}>
            {conditions.map((row) => (
              <View key={row.label} style={styles.row}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {details?.description ? (
          <View style={styles.memoBox}>
            <Text style={styles.memoLabel}>신청자 요청사항</Text>
            <Text style={styles.memoText}>{details.description}</Text>
          </View>
        ) : null}
      </Card>

      {hasLedgerData(ledger) ? (
        <Card>
          <Text style={styles.cardTitle}>건축물대장 (공공데이터)</Text>
          <Text style={styles.cardHint}>
            사진보다 신뢰도가 높은 확정 정보입니다. 사진 판독과 어긋나면 이쪽을 따르세요.
          </Text>
          <View style={styles.rows}>
            {ledgerDisplayRows(ledger).map((row) => (
              <View key={row.label} style={styles.row}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  asbestos: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.card,
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  asbestosText: {
    flex: 1,
  },
  asbestosTitle: {
    color: colors.warning,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  asbestosBody: {
    color: colors.warning,
    fontSize: font.caption,
    lineHeight: 26,
    marginTop: spacing.xs / 2,
  },
  address: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  distanceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs / 2,
    marginTop: spacing.xs,
  },
  distance: {
    color: colors.textMuted,
    fontSize: font.caption,
  },
  areaBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.button,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  areaLabel: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  areaValue: {
    color: colors.primary,
    fontSize: font.titleLarge,
    fontWeight: '800',
    marginTop: spacing.xs / 2,
  },
  areaNote: {
    color: colors.primary,
    fontSize: font.caption,
  },
  areaMissing: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
    marginTop: spacing.xs / 2,
  },
  rows: {
    marginTop: spacing.sm,
  },
  row: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: font.body,
  },
  rowValue: {
    color: colors.text,
    flexShrink: 1,
    fontSize: font.body,
    fontWeight: '700',
    marginLeft: spacing.sm,
    textAlign: 'right',
  },
  memoBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  memoLabel: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
  },
  memoText: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: 28,
    marginTop: spacing.xs / 2,
  },
  cardTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  cardHint: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
    marginTop: spacing.xs / 2,
  },
});
