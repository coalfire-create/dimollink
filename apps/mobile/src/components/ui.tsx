import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { statusColor, theme } from '../theme';

/**
 * 공용 UI 컴포넌트 — 고령 사용자 접근성 기준을 컴포넌트 차원에서 강제한다.
 * (글자 18px+, 버튼 48px+, 여백 8px 배수, 메인+보조 2색)
 * 화면에서는 RN 기본 Button/TextInput 을 직접 쓰지 않고 이것만 쓴다.
 */

const { colors, font, spacing, touch, radius } = theme;

// ── 버튼
export interface AppButtonProps {
  label: string;
  onPress: () => void;
  /** primary: 핵심 동작(큰 버튼) / outline: 보조 동작 / danger: 취소·삭제 */
  variant?: 'primary' | 'outline' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: AppButtonProps) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isPrimary && { backgroundColor: colors.primary, height: touch.primaryButtonHeight },
        variant === 'outline' && styles.buttonOutline,
        variant === 'danger' && styles.buttonDanger,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.background : colors.primary} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            isPrimary && { color: colors.background },
            variant === 'outline' && { color: colors.primary },
            variant === 'danger' && { color: colors.error },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// ── 카드
export function Card({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }, style]}
    >
      {children}
    </Pressable>
  );
}

// ── 상태 배지
export function StatusBadge({ status, label }: { status: string; label: string }) {
  const palette = statusColor(status);
  return (
    <View style={[styles.badge, { backgroundColor: palette.background }]}>
      <Text style={[styles.badgeText, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

// ── 입력 필드 (라벨 + 인풋)
export interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
}

export function Field({ label, hint, style, ...inputProps }: FieldProps) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[styles.fieldInput, style]}
        {...inputProps}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

// ── 섹션 제목
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

// ── 라벨-값 행 (상세 화면용)
export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// ── 오류 배너 (서버 한글 메시지 그대로 노출)
export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

// ── 로딩 / 빈 목록
export function LoadingView() {
  return (
    <View style={styles.centerFill}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <View style={styles.centerFill}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.emptyDescription}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radius.button,
    height: touch.minButtonHeight,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  buttonOutline: {
    backgroundColor: colors.background,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  buttonDanger: {
    backgroundColor: colors.background,
    borderColor: colors.error,
    borderWidth: 2,
  },
  buttonLabel: {
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.badge,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs / 2,
  },
  badgeText: {
    fontSize: font.body,
    fontWeight: '700',
  },
  fieldLabel: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  fieldInput: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    color: colors.text,
    fontSize: font.bodyLarge,
    minHeight: touch.minButtonHeight,
    paddingHorizontal: spacing.sm,
  },
  fieldHint: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  infoRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: font.body,
  },
  infoValue: {
    color: colors.text,
    flexShrink: 1,
    fontSize: font.body,
    fontWeight: '600',
    marginLeft: spacing.sm,
    textAlign: 'right',
  },
  errorBanner: {
    backgroundColor: '#FBEAEA',
    borderRadius: radius.badge,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: font.body,
    fontWeight: '600',
  },
  centerFill: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '700',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptyDescription: {
    color: colors.textMuted,
    fontSize: font.body,
    textAlign: 'center',
  },
});
