import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ALLBARO_MANDATORY_CONSTRUCTION_WASTE_TON } from '@dimol/shared';
import { FadeInUp } from '../../components/motion';
import { theme } from '../../theme';
import type { RequestFormState } from './useRequestForm';

/**
 * 올바로 전자인계서 신고 동의 — 업체 회원에게만 보인다.
 *
 * 의무 대상(건설폐기물 5톤 이상)이면 안내를 먼저 띄운다. 체크를 강제하지는 않는다 —
 * API 장애 시 자체 간이확인서로 폴백하는 경로가 있고, 그 선택은 사용자 몫이다.
 */
export function AllbaroConsent({ form }: { form: RequestFormState }) {
  if (!form.canRequestAllbaro) return null;
  const checked = form.allbaroRequested;

  return (
    <>
      {form.allbaroMandatory ? (
        <FadeInUp>
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>♻️ 올바로 신고 대상</Text>
            <Text style={styles.noticeBody}>
              {ALLBARO_MANDATORY_CONSTRUCTION_WASTE_TON}톤 이상은 전자인계서 의무 대상이에요. 켜
              두면 자동으로 처리해 드려요.
            </Text>
          </View>
        </FadeInUp>
      ) : null}

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel="올바로 전자인계서 신고"
        onPress={() => form.setAllbaroRequested(!checked)}
        style={[styles.row, checked && styles.rowChecked]}
      >
        <Text style={styles.mark}>{checked ? '☑' : '☐'}</Text>
        <View style={styles.body}>
          <Text style={styles.label}>올바로 전자인계서 신고</Text>
          <Text style={styles.hint}>
            {checked ? '자동 발행해 드려요' : '자체 간이 확인서로 대체'}
          </Text>
        </View>
      </Pressable>
    </>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  notice: {
    backgroundColor: colors.primarySoft,
    borderLeftColor: colors.primary,
    borderLeftWidth: 4,
    borderRadius: radius.card,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  noticeTitle: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  noticeBody: {
    color: colors.primary,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: 'transparent',
    borderRadius: radius.card,
    borderWidth: 2,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    padding: spacing.md,
    ...theme.shadow.card,
  },
  rowChecked: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  mark: {
    color: colors.primary,
    fontSize: font.titleLarge,
    marginRight: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
});
