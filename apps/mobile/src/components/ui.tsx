import React from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { PressableScale, usePressScale } from './motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  const { scale, onPressIn, onPressOut } = usePressScale();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        styles.button,
        isPrimary && styles.buttonPrimary,
        isPrimary && theme.shadow.primary,
        variant === 'outline' && styles.buttonOutline,
        variant === 'danger' && styles.buttonDanger,
        (disabled || loading) && styles.buttonDisabled,
        { transform: [{ scale }] },
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
    </AnimatedPressable>
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
    <PressableScale accessibilityRole="button" onPress={onPress} style={[styles.card, style]}>
      {children}
    </PressableScale>
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

export function Field({ label, hint, style, onFocus, onBlur, ...inputProps }: FieldProps) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.fieldInput, focused && styles.fieldInputFocused, style]}
        {...inputProps}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

// ── 섹션 제목 (작고 절제된 라벨 톤)
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

// ── 하단 고정 CTA 바 (결제/접수 등 핵심 동작을 화면 하단에 고정)
export function StickyFooter({ children }: { children: React.ReactNode }) {
  return <View style={styles.stickyFooter}>{children}</View>;
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

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon?: string;
}) {
  return (
    <View style={styles.centerFill}>
      {icon ? (
        <View style={styles.emptyIconCircle}>
          <Text style={styles.emptyIcon}>{icon}</Text>
        </View>
      ) : null}
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
  buttonPrimary: {
    backgroundColor: colors.primary,
    height: touch.primaryButtonHeight,
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
  buttonDisabled: {
    opacity: 0.5,
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
    padding: spacing.md,
    ...theme.shadow.card,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.badge,
    paddingHorizontal: spacing.sm,
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
    backgroundColor: colors.surface,
    borderColor: 'transparent',
    borderRadius: radius.button,
    borderWidth: 2,
    color: colors.text,
    fontSize: font.bodyLarge,
    minHeight: touch.primaryButtonHeight,
    paddingHorizontal: spacing.sm,
  },
  fieldInputFocused: {
    backgroundColor: colors.background,
    borderColor: colors.primary,
  },
  fieldHint: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  stickyFooter: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
    borderRadius: radius.button,
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
  emptyIconCircle: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 999,
    height: 88,
    justifyContent: 'center',
    marginBottom: spacing.md,
    width: 88,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptyDescription: {
    color: colors.textMuted,
    fontSize: font.body,
    textAlign: 'center',
  },
});
