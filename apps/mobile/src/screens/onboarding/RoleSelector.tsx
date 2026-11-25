import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { UserType } from '@dimol/shared';
import { PressableScale } from '../../components/motion';
import { FEATURE_INTERIOR } from '../../featureFlags';
import { TABULAR_NUMS } from '../../lib/format';
import { theme } from '../../theme';

/**
 * 가입 유형 선택 — 번호가 매겨진 건축 명세 선택 행(01..04).
 */
interface RoleOption {
  type: UserType;
  code: string;
  title: string;
  description: string;
}

const TYPE_OPTIONS: RoleOption[] = [
  {
    type: 'CONSUMER',
    code: '01',
    title: '소비자',
    description: '철거·폐기물 처리를 맡기고 싶어요',
  },
  {
    type: 'DEMOLITION_COMPANY',
    code: '02',
    title: '철거업체',
    description: '철거 작업을 수주하고 싶어요',
  },
  {
    type: 'TRANSPORT_COMPANY',
    code: '03',
    title: '운반업체',
    description: '폐기물 운반 콜을 받고 싶어요',
  },
  {
    type: 'WASTE_TREATMENT_PLANT',
    code: '04',
    title: '처리장',
    description: '폐기물 반입 예약을 받고 싶어요',
  },
  {
    type: 'INTERIOR_COMPANY',
    code: '05',
    title: '인테리어 업체',
    description: '인테리어 시공 견적을 넣고 싶어요',
  },
];

export function RoleSelector({
  value,
  onChange,
}: {
  value: UserType;
  onChange: (type: UserType) => void;
}) {
  const options = TYPE_OPTIONS.filter(
    (option) => FEATURE_INTERIOR || option.type !== 'INTERIOR_COMPANY',
  );

  return (
    <>
      {options.map((option) => {
        const selected = value === option.type;
        return (
          <PressableScale
            key={option.type}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${option.title} — ${option.description}`}
            onPress={() => onChange(option.type)}
            style={[styles.card, selected && styles.cardSelected]}
          >
            <View style={[styles.codePlate, selected && styles.codePlateSelected]}>
              <Text style={[styles.codeText, TABULAR_NUMS, selected && styles.codeTextSelected]}>
                {option.code}
              </Text>
            </View>
            <View style={styles.info}>
              <Text style={[styles.title, selected && styles.titleSelected]}>{option.title}</Text>
              <Text style={styles.description}>{option.description}</Text>
            </View>
            <View style={[styles.check, selected && styles.checkSelected]}>
              {selected ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
          </PressableScale>
        );
      })}
    </>
  );
}

const { colors, font, spacing, radius, onDark } = theme;

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: spacing.xs,
    padding: spacing.md,
  },
  cardSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderLeftWidth: 4,
  },
  codePlate: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.badge,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 44,
  },
  codePlateSelected: {
    backgroundColor: onDark.canvas,
    borderColor: onDark.canvas,
  },
  codeText: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '700',
  },
  codeTextSelected: {
    color: colors.background,
  },
  info: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  titleSelected: {
    color: colors.primary,
  },
  description: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: 4,
  },
  check: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.badge,
    borderWidth: 1.5,
    height: 24,
    justifyContent: 'center',
    marginLeft: spacing.xs,
    width: 24,
  },
  checkSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkMark: {
    color: colors.background,
    fontSize: theme.glyph.inline,
    fontWeight: '700',
  },
});
