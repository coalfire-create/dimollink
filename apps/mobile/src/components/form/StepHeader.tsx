import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

/**
 * 번호 붙은 단계 제목 — "① 건물 면적", "② 건물 구조".
 *
 * 입력이 여러 단계로 나뉜 화면에서, 지금 몇 번째를 채우는 중인지 보이게 한다.
 * 필수가 아닌 단계는 optional 문구로 표시한다 — 안 채워도 된다는 걸 모르면
 * 사용자는 거기서 멈춘다.
 */
export function StepHeader({
  index,
  title,
  optional,
}: {
  index: number;
  title: string;
  /** "선택하면 더 정확해요" 같은 보조 문구. */
  optional?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{index}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {optional ? <Text style={styles.optional}>{optional}</Text> : null}
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 26,
    justifyContent: 'center',
    marginRight: spacing.xs,
    width: 26,
  },
  badgeText: {
    color: colors.background,
    fontSize: font.caption,
    fontWeight: '800',
  },
  title: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  optional: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginLeft: spacing.xs,
  },
});
