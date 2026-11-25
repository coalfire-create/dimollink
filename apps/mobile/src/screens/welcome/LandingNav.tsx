import React from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SUPPORT_PHONE } from '@dimol/shared';
import brandmark from '../../../assets/brandmark.png';
import { TABULAR_NUMS } from '../../lib/format';
import { theme } from '../../theme';

export type LandingSection = 'how' | 'features' | 'partners' | 'pricing';

const MENU: ReadonlyArray<{ key: LandingSection; label: string }> = [
  { key: 'how', label: '이용 방법' },
  { key: 'features', label: '서비스 특징' },
  { key: 'partners', label: '업체 회원' },
  { key: 'pricing', label: '요금 안내' },
];

/**
 * 로그인 전 홈페이지(데스크톱 웹) 상단 메뉴바.
 * tone="dark" 는 첫 화면 다크 3D 히어로 위에 얹히는 반투명 글래스 헤더다.
 */
export function LandingNav({
  onJump,
  onLogin,
  onSignup,
  onLogoPress,
  onLogoLongPress,
  tone = 'light',
}: {
  onJump?: (section: LandingSection) => void;
  onLogin?: () => void;
  onSignup?: () => void;
  onLogoPress?: () => void;
  onLogoLongPress?: () => void;
  tone?: 'dark' | 'light';
}) {
  const dark = tone === 'dark';
  return (
    <View
      style={[
        styles.bar,
        dark ? styles.barDark : styles.barLight,
        Platform.OS === 'web' && WEB_STICKY,
        Platform.OS === 'web' && (dark ? WEB_GLASS_DARK : WEB_GLASS_LIGHT),
      ]}
    >
      <View style={styles.inner}>
        <Pressable
          accessibilityRole={onLogoPress ? 'link' : 'image'}
          accessibilityLabel={onLogoPress ? '비움 첫 화면' : '비움'}
          delayLongPress={1200}
          onPress={onLogoPress}
          onLongPress={onLogoLongPress}
          style={styles.brand}
        >
          <Image source={brandmark} style={styles.logo} resizeMode="contain" />
          <Text style={[styles.brandText, dark && styles.brandTextDark]}>비움</Text>
          <View style={[styles.brandDivider, dark && styles.brandDividerDark]} />
          <Text style={[styles.brandTag, dark && styles.brandTagDark]}>건설폐기물 중개</Text>
        </Pressable>
        <View style={styles.menu}>
          {onJump
            ? MENU.map((item) => (
                <NavLink
                  key={item.key}
                  label={item.label}
                  dark={dark}
                  onPress={() => onJump(item.key)}
                />
              ))
            : null}
        </View>
        <View style={styles.actions}>
          <Text style={[styles.phone, TABULAR_NUMS, dark && styles.phoneDark]}>
            고객센터 {SUPPORT_PHONE}
          </Text>
          {onLogin ? <NavLink label="로그인" dark={dark} onPress={onLogin} /> : null}
          {onSignup ? <SignupButton onPress={onSignup} /> : null}
        </View>
      </View>
    </View>
  );
}

function NavLink({
  label,
  dark,
  onPress,
}: {
  label: string;
  dark: boolean;
  onPress: () => void;
}) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.link,
        hovered && (dark ? styles.linkHoveredDark : styles.linkHovered),
      ]}
    >
      <Text
        style={[
          styles.linkText,
          dark && styles.linkTextDark,
          hovered && (dark ? styles.linkTextHoveredDark : styles.linkTextHovered),
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SignupButton({ onPress }: { onPress: () => void }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.signup, hovered && styles.signupHovered]}
    >
      <Text style={styles.signupText}>시작하기</Text>
    </Pressable>
  );
}

const { colors, font, spacing, touch, radius, onDark } = theme;

const WEB_STICKY = { position: 'sticky', top: 0 } as unknown as ViewStyle;
const WEB_GLASS_DARK = {
  backgroundColor: 'rgba(17, 19, 21, 0.86)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
} as unknown as ViewStyle;
const WEB_GLASS_LIGHT = {
  backgroundColor: 'rgba(255, 255, 255, 0.90)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
} as unknown as ViewStyle;

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    borderBottomWidth: 1,
    width: '100%',
    zIndex: 20,
  },
  barLight: {
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
  },
  barDark: {
    backgroundColor: onDark.canvas,
    borderBottomColor: onDark.border,
  },
  inner: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 72,
    maxWidth: theme.wideContentWidth,
    paddingHorizontal: spacing.md,
    width: '100%',
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginRight: spacing.lg + spacing.sm,
  },
  logo: { height: 28, width: 28 },
  brandText: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '700',
    letterSpacing: theme.tracking.title,
  },
  brandTextDark: {
    color: colors.background,
  },
  brandDivider: {
    backgroundColor: colors.borderStrong,
    height: 14,
    marginHorizontal: spacing.xs / 2,
    width: 1,
  },
  brandDividerDark: {
    backgroundColor: onDark.border,
  },
  brandTag: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '600',
  },
  brandTagDark: {
    color: onDark.textMuted,
  },
  menu: { flex: 1, flexDirection: 'row', gap: spacing.xs / 2 },
  actions: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  phone: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
    marginRight: spacing.sm,
  },
  phoneDark: {
    color: onDark.textMuted,
  },
  link: {
    borderRadius: radius.badge,
    justifyContent: 'center',
    minHeight: touch.minButtonHeight,
    paddingHorizontal: spacing.sm,
  },
  linkHovered: { backgroundColor: colors.surface },
  linkHoveredDark: { backgroundColor: onDark.surface },
  linkText: { color: colors.textMuted, fontSize: font.body, fontWeight: '600' },
  linkTextDark: { color: onDark.textMuted },
  linkTextHovered: { color: colors.text },
  linkTextHoveredDark: { color: colors.background },
  signup: {
    backgroundColor: colors.primary,
    borderRadius: radius.badge,
    justifyContent: 'center',
    minHeight: touch.minButtonHeight,
    paddingHorizontal: spacing.md,
  },
  signupHovered: { backgroundColor: colors.primaryDark },
  signupText: { color: colors.background, fontSize: font.body, fontWeight: '700' },
});
