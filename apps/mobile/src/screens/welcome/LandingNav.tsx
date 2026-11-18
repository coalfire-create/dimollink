import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SUPPORT_PHONE } from '@dimol/shared';
import brandmark from '../../../assets/brandmark.png';
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
 *
 * 회사 사이트처럼 [로고 · 섹션 메뉴 · 고객센터 / 로그인 · 회원가입]. 메뉴는 같은 페이지의
 * 섹션으로 내려간다(페이지가 하나뿐이라 따로 주소를 만들지 않는다).
 * 로고를 길게 누르면 관리자 백오피스(공유 운영 토큰 경로) — 일반 사용자 눈에는 안 띈다.
 *
 * 로그인·회원가입 화면에서는 같은 막대를 메뉴 없이 쓴다(onJump 없음) — 로고를 누르면 첫 화면.
 */
export function LandingNav({
  onJump,
  onLogin,
  onSignup,
  onLogoPress,
  onLogoLongPress,
}: {
  onJump?: (section: LandingSection) => void;
  onLogin?: () => void;
  onSignup?: () => void;
  onLogoPress?: () => void;
  onLogoLongPress?: () => void;
}) {
  return (
    <View style={styles.bar}>
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
          <Text style={styles.brandText}>비움</Text>
        </Pressable>
        <View style={styles.menu}>
          {onJump
            ? MENU.map((item) => (
                <NavLink key={item.key} label={item.label} onPress={() => onJump(item.key)} />
              ))
            : null}
        </View>
        <View style={styles.actions}>
          <Text style={styles.phone}>고객센터 {SUPPORT_PHONE}</Text>
          {onLogin ? <NavLink label="로그인" onPress={onLogin} /> : null}
          {onSignup ? <SignupButton onPress={onSignup} /> : null}
        </View>
      </View>
    </View>
  );
}

function NavLink({ label, onPress }: { label: string; onPress: () => void }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.link, hovered && styles.linkHovered]}
    >
      <Text style={[styles.linkText, hovered && styles.linkTextHovered]}>{label}</Text>
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
      <Text style={styles.signupText}>회원가입</Text>
    </Pressable>
  );
}

const { colors, font, spacing, touch, radius } = theme;

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    width: '100%',
    zIndex: 10,
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
  logo: { height: 32, width: 32 },
  brandText: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '700',
    letterSpacing: theme.tracking.title,
  },
  menu: { flex: 1, flexDirection: 'row', gap: spacing.xs / 2 },
  actions: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  phone: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
    marginRight: spacing.sm,
  },
  link: {
    borderRadius: radius.button,
    justifyContent: 'center',
    minHeight: touch.minButtonHeight,
    paddingHorizontal: spacing.sm,
  },
  linkHovered: { backgroundColor: colors.appBackground },
  linkText: { color: colors.textMuted, fontSize: font.body, fontWeight: '600' },
  linkTextHovered: { color: colors.text },
  signup: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    justifyContent: 'center',
    minHeight: touch.minButtonHeight,
    paddingHorizontal: spacing.md,
  },
  signupHovered: { backgroundColor: colors.primaryDark },
  signupText: { color: colors.background, fontSize: font.body, fontWeight: '700' },
});
