import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { statusColor, theme } from '../../theme';
import { PressableScale } from '../motion';

/**
 * 화면을 구성하는 기본 판 — 카드, 상태 배지, 섹션 제목, 라벨-값 행, 하단 고정 바,
 * 키보드를 피하는 화면 껍데기.
 *
 * 하나하나는 몇 줄짜리지만 모든 화면이 이 조각들로 짜여 있어서, 여백·모서리·그림자가
 * 여기서 한 번만 정해진다. 화면이 직접 View 에 스타일을 얹기 시작하면 그 규칙이 갈라진다.
 */
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

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const palette = statusColor(status);
  return (
    <View style={[styles.badge, { backgroundColor: palette.background }]}>
      <Text style={[styles.badgeText, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  keyboardAware: {
    backgroundColor: colors.background,
    flex: 1,
  },
  card: {
    // 테두리 없이 그림자만 — 회색 바닥 위 흰 카드가 테두리보다 덜 복잡해 보인다.
    // 강조가 필요한 카드(결제할 차례 등)는 화면에서 테두리를 직접 얹는다.
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 0,
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
});
