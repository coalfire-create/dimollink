import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  toTruckLoads,
  visionMaterialLabel,
  type DimolVisionSummary,
  type WasteItem,
} from '@dimol/shared';
import { Card, SectionTitle } from '../ui';
import { theme } from '../../theme';

/**
 * 물량 브리핑 — 소재별 예상 중량, 차량 대수 환산, AI 분석 결과.
 *
 * 업체가 보던 것은 "○○톤" 한 줄뿐이었다. 정작 소재 구성(콘크리트냐 목재냐)에 따라
 * 처리 단가와 차량이 달라지는데, 그 내역이 요청에는 있으면서 화면에는 없었다.
 *
 * 차량 대수는 **감을 잡기 위한 환산값**이지 배차 계획이 아니다 — 문구로 그렇게 못 박는다.
 */

function kgLabel(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}톤`;
  return `${kg.toLocaleString('ko-KR')}kg`;
}

export function WasteBreakdownCard({
  wasteItems,
  wasteTons,
  vision,
}: {
  wasteItems: readonly WasteItem[];
  wasteTons: number;
  vision?: DimolVisionSummary;
}) {
  const sorted = [...wasteItems].sort((a, b) => b.kg - a.kg);
  const totalKg = sorted.reduce((sum, i) => sum + i.kg, 0);
  const trucks = toTruckLoads(wasteTons);

  return (
    <View>
      <SectionTitle>물량 브리핑</SectionTitle>

      <Card>
        <Text style={styles.total}>{wasteTons.toLocaleString('ko-KR')}톤</Text>
        <Text style={styles.totalNote}>신청 내용 기준 예상 폐기물량</Text>

        {trucks.length > 0 ? (
          <View style={styles.truckRow}>
            {trucks.map((t) => (
              <View key={t.capacityTons} style={styles.truckChip}>
                <Text style={styles.truckChipText}>
                  {t.capacityTons}톤차 {t.count}대
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={styles.hint}>
          차량 대수는 적재량으로 나눈 참고값입니다. 부피가 큰 폐기물은 무게보다 대수가 늘어납니다.
        </Text>

        {sorted.length > 0 ? (
          <View style={styles.rows}>
            {sorted.map((item) => {
              const ratio = totalKg > 0 ? Math.round((item.kg / totalKg) * 100) : 0;
              return (
                <View key={item.material} style={styles.row}>
                  <Text style={styles.rowLabel}>{visionMaterialLabel(item.material)}</Text>
                  <View style={styles.rowRight}>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${Math.max(ratio, 2)}%` }]} />
                    </View>
                    <Text style={styles.rowValue}>{kgLabel(item.kg)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </Card>

      {vision && (vision.summary || vision.materials?.length || vision.hazards?.length) ? (
        <Card>
          <Text style={styles.cardTitle}>디몰비전 사진 분석</Text>
          <Text style={styles.cardHint}>
            사진으로 읽은 추정입니다. 건축물대장과 어긋나면 대장을 우선하세요.
            {vision.confidence ? ` (신뢰도 ${vision.confidence})` : ''}
          </Text>

          {vision.summary ? <Text style={styles.visionSummary}>{vision.summary}</Text> : null}

          {vision.materials && vision.materials.length > 0 ? (
            <View style={styles.tagRow}>
              {vision.materials.map((m) => (
                <View key={m} style={styles.tag}>
                  <Text style={styles.tagText}>{m}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {vision.hazards && vision.hazards.length > 0 ? (
            <View style={styles.hazardBox}>
              <Text style={styles.hazardTitle}>주의 필요 항목</Text>
              {vision.hazards.map((h) => (
                <Text key={h} style={styles.hazardItem}>
                  · {h}
                </Text>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  total: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
  totalNote: {
    color: colors.textMuted,
    fontSize: font.caption,
  },
  truckRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  truckChip: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.badge,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  truckChipText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
    marginTop: spacing.xs,
  },
  rows: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  row: {
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '600',
  },
  rowRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs / 2,
  },
  barTrack: {
    backgroundColor: colors.surface,
    borderRadius: radius.badge,
    flex: 1,
    height: 8,
    overflow: 'hidden',
  },
  barFill: {
    backgroundColor: colors.primary,
    height: '100%',
  },
  rowValue: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
    minWidth: 80,
    textAlign: 'right',
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
  visionSummary: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: 28,
    marginTop: spacing.sm,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  tag: {
    backgroundColor: colors.surface,
    borderRadius: radius.badge,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  tagText: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '600',
  },
  hazardBox: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.button,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  hazardTitle: {
    color: colors.warning,
    fontSize: font.caption,
    fontWeight: '800',
  },
  hazardItem: {
    color: colors.warning,
    fontSize: font.caption,
    lineHeight: 26,
    marginTop: spacing.xs / 2,
  },
});
