import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { IconName } from '../AppIcon';
import { PressableScale } from '../motion';
import { theme } from '../../theme';
import { IconTile } from './IconTile';

/**
 * 목록형 바로가기 한 줄 — 아이콘 타일 + 제목(배지) + 설명 + ›.
 *
 * 사진 촬영 방법·업체 홈 "이어서 맡기기"·운반 사진 첨부가 각자 비슷한 줄을 따로 그리고
 * 있었다(점선 버튼, 밑줄 링크, 커스텀 행). 누를 수 있는 선택지는 이 한 모양으로 보인다.
 * 여러 줄은 [[ListGroup]] 으로 묶으면 흰 카드 + 구분선이 붙는다.
 */
export function ListRow({
  icon,
  title,
  subtitle,
  badge,
  hint,
  disabled,
  busy,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  badge?: string;
  /** 스크린리더용 추가 설명. */
  hint?: string;
  disabled?: boolean;
  /** 처리 중이면 › 대신 스피너. */
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={[styles.row, disabled && styles.disabled]}
    >
      <IconTile icon={icon} style={styles.icon} />
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.chevron}>›</Text>}
    </PressableScale>
  );
}

/** ListRow 여러 줄을 흰 카드 하나에 구분선으로 묶는다. */
export function ListGroup({ children }: { children: React.ReactNode }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {rows.map((row, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <View style={styles.divider} /> : null}
          {row}
        </React.Fragment>
      ))}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    ...theme.shadow.card,
  },
  divider: { backgroundColor: colors.border, height: 1 },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: theme.touch.primaryButtonHeight + spacing.sm,
    paddingVertical: spacing.xs,
  },
  disabled: { opacity: 0.5 },
  icon: { marginRight: spacing.sm },
  text: { flex: 1 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  title: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800' },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
  },
  badgeText: { color: colors.background, fontSize: font.caption, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.xs / 2 },
  chevron: { color: colors.textMuted, fontSize: font.titleLarge, marginLeft: spacing.xs },
});
