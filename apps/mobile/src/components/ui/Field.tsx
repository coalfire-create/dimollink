import React from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { theme } from '../../theme';

/**
 * 입력 필드 — 라벨 + 인풋 + (힌트 또는 오류).
 *
 * 오류가 있으면 힌트 대신 오류를 보여준다. 둘을 같이 띄우면 "이렇게 쓰세요"와
 * "이건 틀렸어요"가 겹쳐서 무엇을 고쳐야 할지 흐려진다.
 */
export interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
  /** 필수 입력이면 라벨에 * 를 붙이고 스크린리더에도 알린다. */
  required?: boolean;
  /** 이 칸에서 잡힌 검증 오류. 있으면 테두리가 빨개지고 힌트 대신 오류가 보인다. */
  error?: string | null;
}

/**
 * ref 를 TextInput 으로 넘긴다 — 한 칸에서 '다음'을 눌러 다음 칸으로 포커스를 옮기는
 * 폼 동작(returnKeyType="next" + onSubmitEditing)에 필요하다.
 */
export const Field = React.forwardRef<TextInput, FieldProps>(function Field(
  { label, hint, required, error, style, onFocus, onBlur, ...inputProps },
  ref,
) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.fieldRequired}> *</Text> : null}
      </Text>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        // 라벨은 화면에만 있고 인풋 자체에는 이름이 없어서, 스크린리더가 "입력창"
        // 이라고만 읽던 것을 라벨로 읽게 한다.
        accessibilityLabel={required ? `${label} (필수)` : label}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.fieldInput,
          focused && styles.fieldInputFocused,
          !!error && styles.fieldInputError,
          style,
        ]}
        {...inputProps}
      />
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
});

/**
 * 입력 아래 오류 문구 — Field 를 쓰지 않는 입력(주소 선택·소재 목록 등)에도 같은 모양으로 붙인다.
 * 색만으로 알리지 않고 문장으로 쓴다(색 구분이 어려운 사용자 고려).
 */
export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Text style={styles.fieldError} accessibilityRole="alert">
      {message}
    </Text>
  );
}

const { colors, font, spacing, radius, touch } = theme;

const styles = StyleSheet.create({
  fieldLabel: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  fieldRequired: {
    color: colors.error,
    fontWeight: '800',
  },
  fieldInput: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1.5,
    color: colors.text,
    fontSize: font.bodyLarge,
    minHeight: touch.primaryButtonHeight,
    paddingHorizontal: spacing.md,
  },
  fieldInputFocused: {
    borderColor: colors.primary,
    ...theme.shadow.card,
  },
  fieldInputError: {
    borderColor: colors.error,
  },
  fieldHint: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs,
  },
  fieldError: {
    color: colors.error,
    fontSize: font.caption,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
});
