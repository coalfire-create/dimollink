import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Field } from '../../components/ui';
import { theme } from '../../theme';
import { localDateKey } from './calendarLocale';
import type { RequestFormState } from './useRequestForm';

/**
 * 처리장 예약 전용 입력 — 방문 희망 날짜.
 *
 * 입력칸을 직접 치게 두지 않고 달력만 여는 이유: 날짜 형식이 틀리면 서버가 거절하는데,
 * 사용자는 어디가 틀렸는지 알 수 없다. 고를 수만 있으면 틀릴 수가 없다.
 * react-native-calendars 인라인 달력을 써서 iOS·Android·웹 모두에서 동일하게 선택된다.
 */
export function DisposalSection({ form }: { form: RequestFormState }) {
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="방문 희망 날짜 선택"
        onPress={() => {
          form.setDatePickerTarget('visitAt');
          form.setShowDatePicker((open) => !open);
        }}
      >
        {/* 안쪽 입력은 터치를 받지 않는다 — 키보드 대신 달력이 뜨게 한다. */}
        <View pointerEvents="none">
          <Field
            label="방문 희망 날짜"
            value={form.visitAt}
            onChangeText={form.setVisitAt}
            placeholder="터치하여 날짜 선택"
            hint="날짜만 선택해 주세요. 시간은 처리장과 협의해요."
            editable={false}
            error={form.fieldErrors.visitAt}
          />
        </View>
      </Pressable>
      {form.showDatePicker ? (
        <View style={styles.calendarWrap}>
          <Calendar
            monthFormat="yyyy년 M월"
            minDate={localDateKey(new Date())}
            onDayPress={(day: { dateString: string }) => {
              form.setVisitAt(day.dateString);
              form.clearFieldError('visitAt');
              form.setShowDatePicker(false);
            }}
            markedDates={
              form.visitAt
                ? { [form.visitAt]: { selected: true, selectedColor: colors.primary } }
                : {}
            }
            style={styles.calendar}
            theme={{
              backgroundColor: colors.background,
              calendarBackground: colors.background,
              textSectionTitleColor: colors.textMuted,
              selectedDayBackgroundColor: colors.primary,
              selectedDayTextColor: colors.background,
              todayTextColor: colors.primary,
              dayTextColor: colors.text,
              textDisabledColor: colors.textMuted,
              arrowColor: colors.primary,
              monthTextColor: colors.text,
              textDayFontWeight: '600',
              textMonthFontWeight: '800',
              textDayHeaderFontWeight: '700',
              textDayFontSize: font.body,
              textMonthFontSize: font.bodyLarge,
              textDayHeaderFontSize: font.caption,
            }}
          />
        </View>
      ) : null}
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          처리장마다 운반요청 가능 여부가 달라요. 예약 후 매칭된 처리장이 「운반요청 별도 필요」면
          운반요청을 함께 하도록 안내해 드려요.
        </Text>
      </View>
    </>
  );
}

const { colors, font, spacing, radius, shadow } = theme;

const styles = StyleSheet.create({
  calendarWrap: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadow.card,
  },
  calendar: {
    borderRadius: radius.card,
  },
  notice: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    marginBottom: spacing.md,
    padding: spacing.sm,
  },
  noticeText: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: font.caption + 6,
  },
});
