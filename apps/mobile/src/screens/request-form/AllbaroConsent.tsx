import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ALLBARO_MANDATORY_CONSTRUCTION_WASTE_TON } from '@dimol/shared';
import { IconTile } from '../../components/ui';
import { FadeInUp } from '../../components/motion';
import { theme } from '../../theme';
import type { RequestFormState } from './useRequestForm';

/**
 * 올바로 전자인계서 신고 동의 — 업체 회원에게만 보인다.
 *
 * 의무 대상(건설폐기물 5톤 이상)이면 안내를 먼저 띄운다. 체크를 강제하지는 않는다 —
 * API 장애 시 자체 간이확인서로 폴백하는 경로가 있고, 그 선택은 사용자 몫이다.
 * 예전에는 "☑/☐" 글자를 체크박스로 썼다(기기마다 모양이 다르고 작다) — 켜고 끄는 줄로 바꿨다.
 */
export function AllbaroConsent({ form }: { form: RequestFormState }) {
  if (!form.canRequestAllbaro) return null;
  const checked = form.allbaroRequested;
  return (
    <View style={styles.wrap}>
      {form.allbaroMandatory ? (
        <FadeInUp>
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>올바로 신고 대상이에요</Text>
            <Text style={styles.noticeBody}>
              건설폐기물 {ALLBARO_MANDATORY_CONSTRUCTION_WASTE_TON}톤 이상은 전자인계서 의무
              대상이에요. 켜 두면 매칭과 함께 자동으로 발행해 드려요.
            </Text>
          </View>
        </FadeInUp>
      ) : null}
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked }}
        accessibilityLabel="올바로 전자인계서 자동 발행"
        onPress={() => form.setAllbaroRequested(!checked)}
        style={[styles.row, checked && styles.rowOn]}
      >
        <IconTile icon="document" tone={checked ? 'solid' : 'brand'} style={styles.icon} />
        <View style={styles.body}>
          <Text style={styles.label}>올바로 자동 신고</Text>
          <Text style={styles.hint}>
            {checked ? '전자인계서를 자동 발행해요' : '끄면 간이 확인서로 대체해요'}
          </Text>
        </View>
        <View style={[styles.track, checked && styles.trackOn]}>
          <View style={[styles.thumb, checked && styles.thumbOn]} />
        </View>
      </Pressable>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  notice: {
    backgroundColor: theme.colors.warningSoft,
    borderRadius: radius.card,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  noticeTitle: { color: theme.colors.warning, fontSize: font.body, fontWeight: '800' },
  noticeBody: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: 26,
    marginTop: spacing.xs / 2,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 2,
    flexDirection: 'row',
    minHeight: theme.touch.primaryButtonHeight + spacing.md,
    padding: spacing.sm,
  },
  rowOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  icon: { marginRight: spacing.sm },
  body: { flex: 1 },
  label: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.xs / 2 },
  track: {
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    height: 32,
    justifyContent: 'center',
    marginLeft: spacing.xs,
    paddingHorizontal: 4,
    width: 56,
  },
  trackOn: { backgroundColor: colors.primary },
  thumb: { backgroundColor: colors.background, borderRadius: radius.pill, height: 24, width: 24 },
  thumbOn: { alignSelf: 'flex-end' },
});
