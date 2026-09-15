import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  PERIOD_FILTERS,
  SORT_OPTIONS,
  STATUS_FILTERS,
  type PeriodFilter,
  type SortKey,
  type StatusFilter,
} from '../../lib/request-filters';
import { theme } from '../../theme';

/**
 * 대시보드 필터 바 — 상태 탭 + 기간 + 정렬.
 *
 * 데스크톱 데이터 그리드의 "컬럼 헤더 정렬 + 필터 드롭다운"을 폭 좁은 화면으로 옮긴 것.
 * 드롭다운 대신 칩을 쓰는 이유: 열기 전에는 무엇을 고를 수 있는지 안 보이고,
 * 작은 메뉴 항목은 고령 사용자가 누르기 어렵다. 칩은 선택지가 늘 보이고 터치 영역이 크다.
 *
 * 상태 탭에 건수를 같이 적는다 — 눌러 보기 전에 어디에 몇 건이 있는지 알 수 있다.
 */
export function RequestFilterBar({
  status,
  period,
  sort,
  counts,
  onChangeStatus,
  onChangePeriod,
  onChangeSort,
}: {
  status: StatusFilter;
  period: PeriodFilter;
  sort: SortKey;
  counts: Record<StatusFilter, number>;
  onChangeStatus: (value: StatusFilter) => void;
  onChangePeriod: (value: PeriodFilter) => void;
  onChangeSort: (value: SortKey) => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.tabRow} accessibilityRole="tablist">
        {STATUS_FILTERS.map(({ value, label }) => {
          const active = value === status;
          return (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${label} ${counts[value]}건`}
              onPress={() => onChangeStatus(value)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
              <Text style={[styles.tabCount, active && styles.tabCountActive]}>{counts[value]}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* 한 줄에 가로 스크롤로 밀어 넣었더니 뒤쪽(정렬)이 화면 밖으로 잘렸다.
          손가락은 밀 수 있어도 마우스는 못 민다 — 두 줄로 나눠 항상 다 보이게 한다. */}
      <View style={styles.chipRow}>
        <Text style={styles.chipGroupLabel}>기간</Text>
        {PERIOD_FILTERS.map(({ value, label }) => (
          <Chip
            key={value}
            label={label}
            active={value === period}
            onPress={() => onChangePeriod(value)}
          />
        ))}
      </View>
      <View style={[styles.chipRow, styles.chipRowLast]}>
        <Text style={styles.chipGroupLabel}>정렬</Text>
        {SORT_OPTIONS.map(({ value, label }) => (
          <Chip
            key={value}
            label={label}
            active={value === sort}
            onPress={() => onChangeSort(value)}
          />
        ))}
      </View>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const { colors, font, spacing, radius, touch } = theme;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
  },
  tab: {
    alignItems: 'center',
    borderBottomColor: 'transparent',
    borderBottomWidth: 3,
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minHeight: touch.minButtonHeight,
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  tabCount: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
    minWidth: 32,
    overflow: 'hidden',
    paddingHorizontal: 4,
    textAlign: 'center',
  },
  tabCountActive: {
    backgroundColor: colors.primarySoft,
    color: colors.primary,
  },
  chipRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
  },
  chipRowLast: {
    paddingBottom: spacing.xs,
  },
  chipGroupLabel: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
    marginRight: 4,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.xs,
  },
  chipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
});
