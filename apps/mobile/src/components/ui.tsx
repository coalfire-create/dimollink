import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SUPPORT_PHONE, SUPPORT_PHONE_TEL_URL } from '@dimol/shared';
import { statusColor, theme } from '../theme';
import { PressableScale, usePressScale } from './motion';
import brandmark from '../../assets/brandmark.png';
import { AppIcon, type IconName } from './AppIcon';

/**
 * 우하단 고객센터 플로팅 버튼 — 주요 화면 위에 떠 있는 원형 문의 버튼.
 * 기본 동작은 고객센터 전화 연결(tel:). onPress 를 주면 문의 폼·채팅 등으로 교체할 수 있다.
 */
export function FloatingSupportButton({ onPress }: { onPress?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`고객센터 문의 ${SUPPORT_PHONE}`}
      onPress={onPress ?? (() => Linking.openURL(SUPPORT_PHONE_TEL_URL))}
      // 탭바(높이 ~64) + 기기 홈 인디케이터 위로 띄운다.
      style={[styles.fab, { bottom: insets.bottom + 96 }]}
    >
      <Text style={styles.fabIcon}>💬</Text>
    </Pressable>
  );
}

/**
 * 빈 이미지 자리 placeholder — 이미지가 없을 때 회색 빈칸 대신 비움 로고를 노출한다.
 * 사진 업로드 전 미리보기 자리 등 "빈 이미지 자리"의 기본값으로 재사용한다.
 */
export function ImagePlaceholder({
  height = 220,
  label,
  children,
}: {
  height?: number;
  label?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.imagePlaceholder, { height }]}>
      <Image source={brandmark} style={styles.imagePlaceholderLogo} resizeMode="contain" />
      {label ? <Text style={styles.imagePlaceholderLabel}>{label}</Text> : null}
      {children}
    </View>
  );
}

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

// ── 섹션 제목 (작고 절제된 라벨 톤)
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

/**
 * 입력칸이 있는 화면의 껍데기 — 키보드가 올라와도 입력칸이 가리지 않게 화면을 밀어 올린다.
 *
 * behavior 가 플랫폼마다 달라야 해서(iOS padding / Android height) 화면마다 같은
 * 분기를 복사해 두면 한 곳만 고쳐지고 나머지는 남는다. 여기 한 번만 둔다.
 */
export function KeyboardAwareScreen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.keyboardAware, style]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

// ── 하단 고정 CTA 바 (결제/접수 등 핵심 동작을 화면 하단에 고정)
export function StickyFooter({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  // 화면 맨 아래 붙는 CTA — 홈 인디케이터에 버튼이 깔리지 않게 밑단을 띄운다.
  return (
    <View style={[styles.stickyFooter, { paddingBottom: insets.bottom + spacing.sm }]}>
      {children}
    </View>
  );
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
// onRetry 를 주면 "다시 시도" 버튼이 같이 뜬다 — 통신 실패를 사용자가 스스로 풀 수 있게.
export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry?: () => void;
}) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다시 시도"
          onPress={onRetry}
          style={styles.errorRetry}
        >
          <Text style={styles.errorRetryText}>다시 시도</Text>
        </Pressable>
      ) : null}
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

/**
 * 섹션 안에서 쓰는 작은 빈 상태.
 *
 * 화면 전체가 비었을 때는 EmptyState 를, 화면 안의 한 섹션("들어온 콜" 같은)이 비었을 때는
 * 이것을 쓴다. 예전에는 회색 글자 한 줄만 덩그러니 놓여서, 비어 있는 건지 아직 불러오는
 * 중인지 구분이 안 됐다.
 */
export function InlineEmpty({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.inlineEmpty}>
      <Text style={styles.inlineEmptyText}>{children}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  icon?: IconName | string;
  /** 빈 화면에서 바로 할 수 있는 다음 행동(예: "철거 요청하기"). */
  actionLabel?: string;
  onAction?: () => void;
}) {
  const isIconName =
    icon &&
    (['notifications', 'document', 'truck', 'building', 'home', 'requests', 'mypage', 'tools', 'check', 'star', 'settings', 'phone', 'sparkles', 'camera', 'chat', 'alert', 'recycle', 'hammer', 'lock'].includes(icon) ||
      icon.length > 2);
  return (
    <View style={styles.centerFill}>
      {icon ? (
        <View style={styles.emptyIconCircle}>
          {isIconName ? (
            <AppIcon name={(icon as IconName) || 'document'} size={28} color={colors.primary} />
          ) : (
            <Text style={styles.emptyIcon}>{icon}</Text>
          )}
        </View>
      ) : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.emptyDescription}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <AppButton label={actionLabel} onPress={onAction} style={styles.emptyAction} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.md,
    // bottom 은 안전영역에 맞춰 런타임에 정한다.
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    ...theme.shadow.primary,
  },
  fabIcon: {
    fontSize: 26,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    width: '100%',
  },
  imagePlaceholderLogo: {
    width: 120,
    height: 96,
    opacity: 0.9,
    marginBottom: spacing.sm,
  },
  imagePlaceholderLabel: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '700',
    textAlign: 'center',
  },
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
  fieldHint: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs,
  },
  fieldRequired: {
    color: colors.error,
    fontWeight: '800',
  },
  fieldInputError: {
    borderColor: colors.error,
  },
  fieldError: {
    color: colors.error,
    fontSize: font.caption,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  keyboardAware: {
    backgroundColor: colors.background,
    flex: 1,
  },
  stickyFooter: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    // paddingBottom 은 안전영역에 맞춰 런타임에 정한다.
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
    backgroundColor: colors.errorSoft,
    borderRadius: radius.button,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: font.body,
    fontWeight: '600',
  },
  errorRetry: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginTop: spacing.xs,
    minHeight: touch.minButtonHeight,
  },
  errorRetryText: {
    color: colors.error,
    fontSize: font.body,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  centerFill: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  inlineEmpty: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderStyle: 'dashed',
    borderWidth: 1,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  inlineEmptyText: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 26,
    textAlign: 'center',
  },
  emptyIconCircle: {
    alignItems: 'center',
    // surface 로 두면 회색 배경 화면에서 원이 배경과 같은 색이라 안 보인다.
    backgroundColor: colors.primarySoft,
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
  emptyAction: {
    marginTop: spacing.md,
    minWidth: 200,
  },
});
