import React from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SUPPORT_PHONE, SUPPORT_PHONE_TEL_URL } from '@dimol/shared';
import { AppIcon } from '../AppIcon';
import { theme } from '../../theme';
import brandmark from '../../../assets/brandmark.png';

/**
 * 브랜드가 드러나는 조각들 — 고객센터 플로팅 버튼과 빈 이미지 자리.
 *
 * 고객센터 버튼을 화면마다 넣지 않고 앱 위에 띄우는 이유: 막힌 사용자는 대개
 * 막힌 그 화면에서 전화를 건다. 찾아 나가게 만들면 그냥 앱을 닫는다.
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
      {/* 이모지는 기기마다 모양이 달라 앱 아이콘들과 따로 논다 — 같은 아이콘 세트로. */}
      <AppIcon name="chat" size={28} color={theme.colors.background} filled />
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

const { colors, font, spacing, radius } = theme;

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
});
