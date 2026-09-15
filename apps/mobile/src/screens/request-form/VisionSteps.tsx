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
    <View style={styles.row}>
      <VisionStep index={1} label="현장 주소 지정" done={addressReady} />
      <View style={styles.bar} />
      <VisionStep index={2} label="건물 정보 확인" done={ledgerDone} busy={ledgerBusy} />
      <View style={styles.bar} />
      <VisionStep index={3} label="현장 사진 등록" done={photoDone} busy={photoBusy} />
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
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  step: {
    alignItems: 'center',
    flex: 1,
  },
  bar: {
    backgroundColor: colors.border,
    height: 2,
    width: spacing.sm,
  },
  dot: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  num: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
  },
  numActive: {
    color: colors.background,
  },
  label: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
    textAlign: 'center',
  },
  labelActive: {
    color: colors.text,
    fontWeight: '700',
  },
});
