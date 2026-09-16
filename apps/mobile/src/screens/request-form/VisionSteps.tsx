import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

/**
 * 현장 사진 분석 3단계 표시 — 주소 지정 → 건물 정보 확인 → 사진 등록.
 *
 * 촬영 버튼이 왜 잠겨 있는지는 버튼만 봐서는 안 보인다. 순서 자체가 분석 품질의
 * 전제라서(주소 없이는 건축물대장을 못 붙인다) 순서를 화면에 드러낸다.
 */
export function VisionSteps({
  addressReady,
  ledgerDone,
  ledgerBusy,
  photoDone,
  photoBusy,
}: {
  addressReady: boolean;
  ledgerDone: boolean;
  ledgerBusy: boolean;
  photoDone: boolean;
  photoBusy: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <VisionStep index={1} label="현장 주소 지정" done={addressReady} />
        <View style={[styles.bar, addressReady && styles.barActive]} />
        <VisionStep index={2} label="건물 정보 확인" done={ledgerDone} busy={ledgerBusy} />
        <View style={[styles.bar, (ledgerDone || photoBusy || photoDone) && styles.barActive]} />
        <VisionStep index={3} label="현장 사진 등록" done={photoDone} busy={photoBusy} />
      </View>
    </View>
  );
}

function VisionStep({
  index,
  label,
  done,
  busy,
}: {
  index: number;
  label: string;
  done: boolean;
  busy?: boolean;
}) {
  const active = done || busy;
  return (
    <View style={styles.step}>
      <View style={[styles.dot, active && styles.dotActive]}>
        <Text style={[styles.num, active && styles.numActive]}>{done ? '✓' : index}</Text>
      </View>
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  step: {
    alignItems: 'center',
    flex: 1,
  },
  bar: {
    backgroundColor: colors.border,
    height: 2,
    flex: 0.6,
    marginTop: 15, // dot 높이 32의 정중앙에 정확히 일치
    alignSelf: 'flex-start',
  },
  barActive: {
    backgroundColor: colors.primary,
  },
  dot: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  dotActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  num: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
  },
  numActive: {
    color: colors.background,
    fontWeight: '800',
  },
  label: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs,
    textAlign: 'center',
    lineHeight: font.caption * 1.3,
  },
  labelActive: {
    color: colors.text,
    fontWeight: '700',
  },
});
