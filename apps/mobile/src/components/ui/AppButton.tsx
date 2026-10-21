import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { theme } from '../../theme';
import { triggerHaptic } from '../../lib/haptics';
import { usePressScale } from '../motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * 주요 버튼 — 고령 사용자 기준(48px 이상, 큰 글씨)을 컴포넌트가 강제한다.
 * 화면에서 RN 기본 Button 을 쓰지 않고 이것만 쓴다.
 */
export interface AppButtonProps {
  label: string;
  onPress: () => void;
  /** primary: 핵심 동작(큰 버튼) / outline: 보조 동작 / danger: 취소·삭제 */
  variant?: 'primary' | 'outline' | 'danger';
  disabled?: boolean;
  /** 버튼 비활성화 이유 — 고령 사용자가 왜 못 누르는지 알 수 있게 버튼 밑에 안내한다. */
  disabledReason?: string;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  disabledReason,
  loading,
  style,
}: AppButtonProps) {
  const isPrimary = variant === 'primary';
  const { scale, onPressIn, onPressOut } = usePressScale();

  const handlePress = () => {
    if (disabled || loading) return;
    triggerHaptic(isPrimary ? 'medium' : 'light');
    onPress();
  };

  const buttonElement = (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={disabled && disabledReason ? disabledReason : undefined}
      disabled={disabled || loading}
      onPress={handlePress}
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

  if (disabled && disabledReason) {
    return (
      <View style={styles.disabledContainer}>
        {buttonElement}
        <View style={styles.reasonWrap}>
          <Text style={styles.reasonIcon}>ℹ️</Text>
          <Text style={styles.reasonText}>{disabledReason}</Text>
        </View>
      </View>
    );
  }

  return buttonElement;
}

const { colors, font, spacing, radius, touch } = theme;

const styles = StyleSheet.create({
  disabledContainer: {
    width: '100%',
  },
  reasonWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  reasonIcon: {
    fontSize: theme.glyph.small,
    marginRight: spacing.xs / 2,
  },
  reasonText: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '600',
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    opacity: 0.8,
  },
  buttonLabel: {
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
});

