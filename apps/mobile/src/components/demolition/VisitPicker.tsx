import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { hourLabel, VISIT_HOURS, visitDays, visitIso } from '../../lib/visit-slots';
import { theme } from '../../theme';

/**
 * 실사 희망 일시 — 날짜 칩(내일부터 일주일) + 시간 칩 네 개. 둘 다 고르면 ISO 를 올려 준다.
 * 날짜를 글자로 입력하게 하던 칸을 대신한다([[visit-slots]]).
 */
export function VisitPicker({ onChange }: { value?: string; onChange: (iso: string) => void }) {
  const days = useMemo(() => visitDays(new Date()), []);
  const [day, setDay] = useState<string | null>(null);
  const [hour, setHour] = useState<number | null>(null);

  function pick(nextDay: string | null, nextHour: number | null) {
    setDay(nextDay);
    setHour(nextHour);
    if (nextDay && nextHour !== null) onChange(visitIso(nextDay, nextHour));
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>실사 받을 날짜</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {days.map((d) => (
          <Chip
            key={d.key}
            text={d.label}
            active={day === d.key}
            onPress={() => pick(d.key, hour)}
          />
        ))}
      </ScrollView>
      <Text style={styles.label}>시간</Text>
      <View style={styles.wrapRow}>
        {VISIT_HOURS.map((h) => (
          <Chip key={h} text={hourLabel(h)} active={hour === h} onPress={() => pick(day, h)} />
        ))}
      </View>
    </View>
  );
}

function Chip({ text, active, onPress }: { text: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={text}
      onPress={onPress}
      style={[styles.chip, active && styles.chipOn]}
    >
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{text}</Text>
    </Pressable>
  );
}

const { colors, font, spacing, radius, touch } = theme;

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm },
  label: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  row: { gap: spacing.xs, paddingRight: spacing.sm },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: touch.minButtonHeight,
    paddingHorizontal: spacing.sm,
  },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  chipTextOn: { color: colors.primary, fontWeight: '800' },
});
