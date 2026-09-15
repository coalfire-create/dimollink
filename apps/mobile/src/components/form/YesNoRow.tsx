import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

/**
 * 예/아니오 한 줄 — 왼쪽에 묻는 말, 오른쪽에 두 개짜리 선택(엘리베이터 유무 등).
 *
 * 체크박스로 두지 않는 이유: 체크 안 된 상태가 "없음"인지 "아직 안 골랐음"인지
 * 구분되지 않는다. 두 버튼 중 하나가 늘 선택돼 있어야 업체가 현장 조건을 믿을 수 있다.
 */
export function YesNoRow({
  label,
  value,
  onChange,
  yesLabel = '있음',
  noLabel = '없음',
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.segment} accessibilityRole="radiogroup">
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: value }}
          accessibilityLabel={`${label} ${yesLabel}`}
          style={[styles.button, value && styles.buttonActive]}
          onPress={() => onChange(true)}
        >
          <Text style={[styles.text, value && styles.textActive]}>{yesLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: !value }}
          accessibilityLabel={`${label} ${noLabel}`}
          style={[styles.button, !value && styles.buttonActive]}
          onPress={() => onChange(false)}
        >
          <Text style={[styles.text, !value && styles.textActive]}>{noLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '600',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  button: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  buttonActive: {
    backgroundColor: colors.primary,
  },
  text: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
  textActive: {
    color: colors.background,
    fontWeight: '700',
  },
});
