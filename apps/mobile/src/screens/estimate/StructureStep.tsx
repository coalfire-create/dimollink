import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BUILDING_STRUCTURE_HINTS,
  BUILDING_STRUCTURE_LABELS,
  type BuildingStructure,
} from '@dimol/shared';
import { AppIcon } from '../../components/AppIcon';
import { PressableScale } from '../../components/motion';
import { StepHeader } from '../../components/form/StepHeader';
import { theme } from '../../theme';
import type { VolumeEstimateState } from './useVolumeEstimate';

/**
 * 2단계 — 건물 구조(선택).
 *
 * 구조에 따라 ㎡당 발생량이 크게 달라져서 정확도가 올라가지만, 모르는 사용자도 많다.
 * 그래서 필수로 만들지 않고 각 항목에 "어떤 건물이 여기에 해당하는지" 힌트를 붙였다.
 */
const STRUCTURES = Object.entries(BUILDING_STRUCTURE_LABELS) as Array<[BuildingStructure, string]>;

export function StructureStep({ estimate }: { estimate: VolumeEstimateState }) {
  return (
    <>
      <StepHeader index={2} title="건물 구조" optional="선택하면 더 정확해요" />
      <View style={styles.list}>
        {STRUCTURES.map(([value, label]) => {
          const selected = estimate.structure === value;
          return (
            <PressableScale
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={label}
              onPress={() => estimate.toggleStructure(value)}
              style={[styles.card, selected && styles.cardSelected]}
            >
              <View style={styles.textBox}>
                <Text style={[styles.name, selected && styles.nameSelected]}>{label}</Text>
                <Text style={styles.hint}>{BUILDING_STRUCTURE_HINTS[value]}</Text>
              </View>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? (
                  <AppIcon name="check" size={14} color={theme.colors.background} />
                ) : null}
              </View>
            </PressableScale>
          );
        })}
      </View>
    </>
  );
}

const { colors, font, spacing, radius, touch } = theme;

const styles = StyleSheet.create({
  nameSelected: {
    color: colors.primary,
  },
  list: {
    marginBottom: spacing.lg,
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1.5,
    flexDirection: 'row',
    marginBottom: spacing.xs,
    minHeight: touch.minButtonHeight + 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cardSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  textBox: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
  },
  radio: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    marginLeft: spacing.sm,
    width: 24,
  },
  radioSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});
