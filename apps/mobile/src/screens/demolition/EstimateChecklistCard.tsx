import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { EstimateChecklist } from '@dimol/shared';
import { AppIcon } from '../../components/AppIcon';
import { Card, SectionTitle } from '../../components/ui';
import { theme } from '../../theme';

/**
 * 산정 전 확인 — 금액을 올리는 조건과, 지금은 알 수 없는 것.
 *
 * 둘을 색으로 구분한다. 주의(경고색)는 **확인된 사실**이라 금액에 반영해야 하고,
 * 결측(무채색)은 **모르는 것**이라 범위를 넓게 잡을 근거가 된다.
 * 섞어 두면 "사진 없음"과 "석면 의심"이 같은 무게로 읽힌다.
 */
export function EstimateChecklistCard({ checklist }: { checklist: EstimateChecklist }) {
  if (checklist.caution.length === 0 && checklist.missing.length === 0) return null;

  return (
    <>
      <SectionTitle>산정 전 확인</SectionTitle>
      <Card>
        {checklist.caution.map((line) => (
          <View key={line} style={styles.row}>
            <AppIcon name="alert" size={20} color={colors.warning} />
            <Text style={styles.caution}>{line}</Text>
          </View>
        ))}
        {checklist.missing.map((line) => (
          <View key={line} style={styles.row}>
            <AppIcon name="document" size={20} color={colors.textMuted} />
            <Text style={styles.missing}>{line}</Text>
          </View>
        ))}
      </Card>
    </>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  caution: {
    color: colors.text,
    flex: 1,
    fontSize: font.body,
    lineHeight: 28,
  },
  missing: {
    color: colors.textMuted,
    flex: 1,
    fontSize: font.body,
    lineHeight: 28,
  },
});
