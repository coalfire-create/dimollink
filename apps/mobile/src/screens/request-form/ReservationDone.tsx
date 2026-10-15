import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, IconTile, StickyFooter } from '../../components/ui';
import { FadeInUp } from '../../components/motion';
import { ScreenHeader } from '../../navigation';
import { theme } from '../../theme';
import type { RequestFormState } from './useRequestForm';

/**
 * 처리장 예약 접수 완료 화면.
 *
 * 다른 요청과 달리 상세로 곧장 보내지 않는 이유: 처리장 예약만 해 두면 폐기물을 그곳까지
 * 옮길 운반이 비어 있는 경우가 많다. 여기서 바로 운반요청으로 이어 주면 같은 소재·무게를
 * 다시 입력하지 않아도 되고, 두 요청이 linkedRequestId 로 묶인다.
 */
export function ReservationDone({ form }: { form: RequestFormState }) {
  return (
    <View style={styles.screen}>
      <ScreenHeader title="예약 접수 완료" />
      <ScrollView contentContainerStyle={styles.content}>
        <FadeInUp>
          <View style={styles.card}>
            <IconTile icon="check" size="lg" tone="solid" style={styles.doneIcon} />
            <Text style={styles.title}>처리장 예약이 접수됐어요</Text>
            <Text style={styles.body}>
              매칭된 처리장이 「운반요청 별도 필요」이면 폐기물을 처리장까지 옮길 운반이 따로
              필요해요. 지금 같은 소재·무게로 운반요청도 함께 접수할 수 있어요.
            </Text>
          </View>
        </FadeInUp>
      </ScrollView>
      <StickyFooter>
        <AppButton label="운반요청도 함께 하기" onPress={form.goTransportLink} />
        <Pressable
          accessibilityRole="button"
          onPress={form.finishReservation}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryBtnText}>예약만 하고 마치기</Text>
        </Pressable>
      </StickyFooter>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.md,
    alignItems: 'center',
  },
  doneIcon: {
    marginBottom: theme.spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  body: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: font.body + 8,
    textAlign: 'center',
  },
  secondaryBtn: {
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
  },
  secondaryBtnText: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '700',
  },
});
