import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GeoPoint } from '@dimol/shared';
import { AppIcon } from './AppIcon';
import { FieldError } from './ui';
import { AddressPickerModal } from './address/AddressPickerModal';
import { useAddressPicker } from './address/useAddressPicker';
import { theme } from '../theme';

/**
 * 현장 주소 입력 — 눌러서 지도를 열고, 지도에서 확정한 주소를 돌려받는다.
 *
 * 주소를 손으로 치게 두지 않는 이유: 철거 현장은 상호도 간판도 없는 경우가 많아서
 * 사용자가 적은 주소와 실제 위치가 어긋나기 쉽다. 지도에서 핀을 맞추면 좌표가 함께
 * 넘어오고, 그 좌표로 거리 기반 매칭과 건축물대장 조회가 돌아간다.
 *
 * 지도와 주고받는 동작은 [[useAddressPicker]] 에, 화면은 `components/address/` 에 있다.
 */
export interface AddressPickerFieldProps {
  label: string;
  value: string;
  onChangeAddress: (selectedAddress: string, region: string, location?: GeoPoint) => void;
  placeholder?: string;
  hint?: string;
  /** 검증 오류 문구 — 있으면 입력 테두리가 오류색이 되고 아래에 문구가 붙는다. */
  error?: string | null;
}

export function AddressPickerField({
  label,
  value,
  onChangeAddress,
  placeholder = '지도에서 현장 위치를 선택하세요',
  hint,
  error,
}: AddressPickerFieldProps) {
  const picker = useAddressPicker(onChangeAddress);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Pressable accessibilityRole="button" style={styles.searchBtn} onPress={picker.openModal}>
          <AppIcon name="location" size={18} color={colors.primary} />
          <Text style={styles.searchBtnText}>지도에서 선택</Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        style={[styles.fieldInput, error ? styles.fieldInputError : null]}
        onPress={picker.openModal}
      >
        <Text style={value ? styles.inputText : styles.placeholderText} numberOfLines={2}>
          {value || placeholder}
        </Text>
      </Pressable>
      {error ? (
        <FieldError message={error} />
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}

      <AddressPickerModal picker={picker} />
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  label: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.button,
  },
  searchBtnText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
    marginLeft: spacing.xs / 2,
  },
  fieldInput: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    justifyContent: 'center',
    minHeight: 52,
  },
  inputText: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '600',
  },
  placeholderText: {
    color: colors.textMuted,
    fontSize: font.body,
  },
  fieldInputError: {
    borderColor: theme.colors.error,
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs,
  },
});
