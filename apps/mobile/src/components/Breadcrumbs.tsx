import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

/**
 * 브레드크럼 — 지금 어느 단계에 있고, 어디로 되돌아갈 수 있는지.
 *
 * 뒤로가기 하나만 있으면 "몇 번 눌러야 목록으로 돌아가는지"를 사용자가 세어야 한다.
 * 경로를 적어 두면 중간 단계로 한 번에 돌아간다(마지막 항목은 현재 위치라 누를 수 없다).
 * 가로 스크롤을 두는 이유: 경로가 길어져도 줄바꿈으로 화면을 먹지 않게 하려고.
 */

export interface Crumb {
  label: string;
  /** 없으면 현재 위치(비활성). */
  onPress?: () => void;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={`현재 위치: ${items.map((i) => i.label).join(' 다음 ')}`}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <View key={`${item.label}-${index}`} style={styles.item}>
            {item.onPress && !isLast ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${item.label} (으)로 이동`}
                onPress={item.onPress}
                style={styles.linkHit}
              >
                <Text style={styles.link}>{item.label}</Text>
              </Pressable>
            ) : (
              <Text style={[styles.text, isLast && styles.current]} numberOfLines={1}>
                {item.label}
              </Text>
            )}
            {!isLast ? <Text style={styles.separator}>›</Text> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  item: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  linkHit: {
    // 터치 영역을 글자보다 넉넉하게 — 작은 글씨 링크를 누르기 어려우면 안 된다.
    justifyContent: 'center',
    minHeight: theme.touch.minButtonHeight,
    paddingHorizontal: spacing.xs,
  },
  link: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  text: {
    color: colors.textMuted,
    fontSize: font.caption,
    paddingHorizontal: 4,
  },
  current: {
    color: colors.text,
    fontWeight: '700',
  },
  separator: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginHorizontal: 4,
  },
});
