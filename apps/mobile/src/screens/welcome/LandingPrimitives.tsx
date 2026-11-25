import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import brandmark from '../../../assets/brandmark.png';
import { theme } from '../../theme';

/** 앱 첫 줄 — 로고 + 서비스 이름. 길게 누르면 관리자 경로(운영자만 안다). */
export function MobileBrand({
  onLongPress,
  tone = 'light',
}: {
  onLongPress?: () => void;
  tone?: 'dark' | 'light';
}) {
  const dark = tone === 'dark';
  return (
    <Pressable
      accessibilityRole="image"
      accessibilityLabel="비움"
      delayLongPress={1200}
      onLongPress={onLongPress}
      style={styles.brandRow}
    >
      <Image source={brandmark} style={styles.brandLogo} resizeMode="contain" />
      <Text style={[styles.brandName, dark && styles.brandNameDark]}>비움</Text>
      <View style={[styles.brandRule, dark && styles.brandRuleDark]} />
      <Text style={[styles.brandTag, dark && styles.brandTagDark]}>건설폐기물 중개</Text>
    </Pressable>
  );
}

export function TextLink({
  label,
  onPress,
  tone = 'light',
}: {
  label: string;
  onPress: () => void;
  tone?: 'dark' | 'light';
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Text style={[styles.linkText, tone === 'dark' && styles.linkTextDark]}>{label}</Text>
    </Pressable>
  );
}

/** 본문 구획 하나 — 바탕색 띠(white / stone / dark) + 가운데 본문 칸. */
export function Band({
  tone,
  wide,
  onLayout,
  children,
}: {
  tone: 'white' | 'stone' | 'dark';
  wide: boolean;
  onLayout?: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <View
      onLayout={onLayout}
      style={[
        styles.band,
        tone === 'stone' && styles.bandStone,
        tone === 'dark' && styles.bandDark,
        wide && styles.bandWide,
      ]}
    >
      <View style={[styles.inner, wide && styles.innerWide]}>{children}</View>
    </View>
  );
}

const { colors, font, spacing, onDark } = theme;

const styles = StyleSheet.create({
  inner: { alignSelf: 'center', paddingHorizontal: spacing.md, width: '100%' },
  innerWide: { maxWidth: theme.wideContentWidth },
  brandRow: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
    minHeight: theme.touch.minButtonHeight,
  },
  brandLogo: { height: 28, width: 28 },
  brandName: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '700',
    letterSpacing: theme.tracking.title,
  },
  brandNameDark: { color: colors.background },
  brandRule: { backgroundColor: colors.borderStrong, height: 14, width: 1 },
  brandRuleDark: { backgroundColor: onDark.border },
  brandTag: { color: colors.textMuted, fontSize: font.caption, fontWeight: '600' },
  brandTagDark: { color: onDark.textMuted },
  linkText: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  linkTextDark: {
    color: onDark.text,
  },
  band: {
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: spacing.lg,
  },
  bandStone: { backgroundColor: colors.appBackground },
  bandDark: {
    backgroundColor: onDark.canvas,
    borderBottomColor: onDark.border,
  },
  bandWide: { paddingVertical: spacing.lg * 3 },
});
