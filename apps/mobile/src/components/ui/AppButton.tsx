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
import { AppIcon } from '../AppIcon';
import { triggerHaptic } from '../../lib/haptics';
import { usePressScale } from '../motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * 주요 버튼 — 고령 사용자 기준(48px 이상, 큰 글씨)을 컴포넌트가 강제한다.
 * 화면에서 RN 기본 Button 을 쓰지 않고 이것만 쓴다.
 *
 * 생김새는 큰 서비스들의 버튼 체계를 따른다 — 한 화면의 핵심 동작 하나만 파란 면(primary),
 * 나머지는 회색 테두리(outline)나 옅은 파란 면(secondary)으로 한 단계 물러선다.
 * 예전 outline 은 파란 2px 테두리여서 "로그인/회원가입"처럼 두 버튼이 나란히 서면
 * 둘 다 주인공처럼 보였다.
 */
export interface AppButtonProps {
  label: string;
  onPress: () => void;
  /**
   * primary: 핵심 동작(파란 면) / outline: 보조 동작(흰 바탕 + 회색 테두리)
   * secondary: 같은 화면의 두 번째 권장 동작(옅은 파란 면) / danger: 취소·삭제
   */
  variant?: 'primary' | 'outline' | 'secondary' | 'danger';
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
  const inactive = !!disabled || !!loading;
  const { scale, onPressIn, onPressOut } = usePressScale(0.98);
  // 웹에서 마우스를 올리면 한 톤 진해진다 — 누를 수 있다는 걸 커서 말고도 보여 준다.
  const [hovered, setHovered] = React.useState(false);

  const handlePress = () => {
    if (inactive) return;
    triggerHaptic(isPrimary ? 'medium' : 'light');
    onPress();
  };

  const tone = TONES[variant];
  const buttonElement = (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={disabled && disabledReason ? disabledReason : undefined}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      disabled={inactive}
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.button,
        isPrimary && styles.buttonPrimary,
        tone.box,
        hovered && !inactive && tone.hover,
        inactive && styles.buttonDisabled,
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
            tone.label,
            // 비활성 배경은 옅은 회색이라 흰 글자를 그대로 두면 거의 안 보였다.
            inactive && { color: colors.textMuted },
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
          <AppIcon name="info" size={18} color={colors.textMuted} style={styles.reasonIcon} />
          <Text style={styles.reasonText}>{disabledReason}</Text>
        </View>
      </View>
    );
  }

  return buttonElement;
}

const { colors, font, spacing, radius, touch } = theme;

/** 변형별 바탕·글자·마우스 올림 색. 화면에서 버튼 색을 따로 칠하지 않게 여기서만 정한다. */
const TONES = {
  primary: StyleSheet.create({
    box: { backgroundColor: colors.primary, borderColor: 'transparent', borderWidth: 1 },
    hover: { backgroundColor: colors.primaryDark },
    label: { color: colors.background },
  }),
  outline: StyleSheet.create({
    box: { backgroundColor: colors.background, borderColor: colors.borderStrong, borderWidth: 1 },
    hover: { backgroundColor: colors.surface, borderColor: colors.textMuted },
    label: { color: colors.text },
  }),
  secondary: StyleSheet.create({
    box: { backgroundColor: colors.primarySoft, borderColor: 'transparent', borderWidth: 1 },
    hover: { borderColor: colors.primary },
    label: { color: colors.primary },
  }),
  danger: StyleSheet.create({
    box: { backgroundColor: colors.errorSoft, borderColor: 'transparent', borderWidth: 1 },
    hover: { borderColor: colors.error },
    label: { color: colors.error },
  }),
} as const;

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
    height: touch.primaryButtonHeight,
  },
  buttonDisabled: {
    backgroundColor: colors.appBackground,
    borderColor: colors.border,
    borderWidth: 1,
  },
  buttonLabel: {
    fontSize: font.bodyLarge,
    fontWeight: '700',
    textAlign: 'center',
  },
});
