import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

/**
 * 페이지네이션 — 목록이 길어졌을 때 "몇 건 중 어디까지 봤는지"를 알려준다.
 *
 * 무한 스크롤 대신 페이지를 쓰는 이유: 이 목록은 흘려보며 구경하는 피드가 아니라
 * 찾으러 오는 장부라, 몇 건인지·되돌아갈 수 있는지가 더 중요하다.
 * 페이지가 하나뿐이면 아예 그리지 않는다(쓸모없는 컨트롤을 두지 않는다).
 */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
}: {
  /** 0-based */
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  const canPrev = page > 0;
  const canNext = page < totalPages - 1;

  return (
    <View style={styles.wrap}>
      <Text style={styles.range}>
        전체 {total}건 중 {first}–{last}
      </Text>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="이전 페이지"
          accessibilityState={{ disabled: !canPrev }}
          disabled={!canPrev}
          onPress={() => onChange(page - 1)}
          style={[styles.navButton, !canPrev && styles.navButtonDisabled]}
        >
          <Text style={[styles.navLabel, !canPrev && styles.navLabelDisabled]}>‹ 이전</Text>
        </Pressable>
        <Text style={styles.pageIndicator}>
          {page + 1} / {totalPages}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다음 페이지"
          accessibilityState={{ disabled: !canNext }}
          disabled={!canNext}
          onPress={() => onChange(page + 1)}
          style={[styles.navButton, !canNext && styles.navButtonDisabled]}
        >
          <Text style={[styles.navLabel, !canNext && styles.navLabelDisabled]}>다음 ›</Text>
        </Pressable>
      </View>
    </View>
  );
}

const { colors, font, spacing, radius, touch } = theme;

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
  },
  range: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginBottom: spacing.xs,
  },
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  navButton: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.primary,
    borderRadius: radius.button,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: touch.minButtonHeight,
    minWidth: 96,
    paddingHorizontal: spacing.sm,
  },
  navButtonDisabled: {
    borderColor: colors.border,
  },
  navLabel: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  navLabelDisabled: {
    color: colors.textMuted,
  },
  pageIndicator: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '800',
    minWidth: 64,
    textAlign: 'center',
  },
});
