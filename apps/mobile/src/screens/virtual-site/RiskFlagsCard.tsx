import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SiteRiskFlag } from '@dimol/shared';
import { Card, SectionTitle } from '../../components/ui';
import { theme } from '../../theme';

/**
 * 위험 신호 — 금액을 크게 흔드는 것(석면·지하·진입로)을 맨 위에 모은다.
 * 판정과 순서는 [[site-risk]] buildSiteRiskFlags 가 정한다. 여기서는 그리기만 한다.
 */
export function RiskFlagsCard({ flags }: { flags: readonly SiteRiskFlag[] }) {
  return (
    <View>
      <SectionTitle>먼저 볼 것</SectionTitle>
      <Card>
        {flags.length === 0 ? (
          <Text style={styles.none}>
            신청 내용·건축물대장·질문 답에서 눈에 띄는 위험 신호는 없어요. 사진으로 한 번 더
            확인하세요.
          </Text>
        ) : (
          flags.map((flag, index) => (
            <View key={flag.id} style={[styles.row, index > 0 && styles.rowDivider]}>
              <View style={[styles.badge, flag.level === 'DANGER' ? styles.danger : styles.check]}>
                <Text
                  style={[
                    styles.badgeText,
                    flag.level === 'DANGER' ? styles.dangerText : styles.checkText,
                  ]}
                >
                  {flag.level === 'DANGER' ? '중요' : '확인'}
                </Text>
              </View>
              <View style={styles.body}>
                <Text style={styles.title}>{flag.title}</Text>
                <Text style={styles.detail}>{flag.detail}</Text>
              </View>
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  none: { color: colors.textMuted, fontSize: font.body, lineHeight: 28 },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowDivider: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.badge,
    paddingHorizontal: spacing.xs,
  },
  danger: { backgroundColor: colors.errorSoft },
  check: { backgroundColor: colors.warningSoft },
  badgeText: { fontSize: font.caption, fontWeight: '800' },
  dangerText: { color: colors.error },
  checkText: { color: colors.warning },
  body: { flex: 1 },
  title: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800' },
  detail: { color: colors.textMuted, fontSize: font.body, lineHeight: 28 },
});
