import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MATERIAL_CATEGORY_LABELS, type DetectedMaterial } from '@dimol/shared';
import { AppIcon } from '../../components/AppIcon';
import { theme } from '../../theme';

/**
 * 소재 한 줄 — 무엇인지, 어떻게 처리되는지, 그 판단의 근거가 무엇인지.
 *
 * 신뢰도를 등급(높음/보통/참고)만 적지 않고 근거를 함께 적는다.
 * "사진 6장 중 5장에서 확인"이 "신뢰도 높음"보다 훨씬 설득력 있고, 사용자가
 * 직접 판단할 수 있다.
 */
const CONFIDENCE_LABELS: Record<string, string> = {
  LOW: '참고',
  MEDIUM: '보통',
  HIGH: '높음',
};

export function MaterialRow({ material }: { material: DetectedMaterial }) {
  const { hazardous, recyclable } = material;
  return (
    <View style={[styles.row, hazardous && styles.rowHazard]}>
      <View style={styles.top}>
        <View style={styles.nameWrap}>
          {hazardous ? <AppIcon name="alert" size={16} color={colors.error} /> : null}
          <Text style={styles.name}>{material.name}</Text>
        </View>
        <View style={[styles.tag, hazardous ? styles.tagHazard : styles.tagOk]}>
          <Text style={[styles.tagText, hazardous ? styles.tagTextHazard : styles.tagTextOk]}>
            {hazardous ? '위험물' : recyclable ? '재활용 가능' : '일반 처리'}
          </Text>
        </View>
      </View>
      <Text style={styles.meta}>
        {MATERIAL_CATEGORY_LABELS[material.category]} · 신뢰도{' '}
        {CONFIDENCE_LABELS[material.confidence] ?? material.confidence}
        {material.detectedIn && material.photoCount
          ? ` (사진 ${material.photoCount}장 중 ${material.detectedIn}장에서 확인)`
          : ''}
        {material.basis === 'LEDGER' ? ' · 건축물대장 근거' : ''}
        {material.note ? ` · ${material.note}` : ''}
      </Text>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  nameWrap: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  row: {
    paddingVertical: spacing.xs,
  },
  rowHazard: {},
  top: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  name: {
    color: colors.text,
    flex: 1,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  meta: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
  tag: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  tagOk: {
    backgroundColor: colors.primarySoft,
  },
  tagHazard: {
    backgroundColor: colors.errorSoft,
  },
  tagText: {
    fontSize: font.caption,
    fontWeight: '700',
  },
  tagTextOk: {
    color: colors.primary,
  },
  tagTextHazard: {
    color: colors.error,
  },
});
