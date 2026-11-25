import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CANCELLATION_PENALTY_RATE } from '@dimol/shared';
import { Card, SectionTitle } from '../../components/ui';
import { TABULAR_NUMS } from '../../lib/format';
import { theme } from '../../theme';

/**
 * "비움이 지키는 것" — 플랫폼이 실제로 코드로 보장하는 규칙 원장(01..03).
 */
const GUARANTEES: Array<{ code: string; title: string; body: string }> = [
  {
    code: '01',
    title: '올바로 전자인계서 자동 처리',
    body: '의무 대상이면 매칭과 동시에 전자인계서를 발행합니다. 올바로에 따로 로그인하지 않아도 됩니다.',
  },
  {
    code: '02',
    title: '검증된 업체만 매칭',
    body: '사업자등록번호 확인과 관리자 승인을 거친 업체에게만 요청이 전달됩니다.',
  },
  {
    code: '03',
    title: '배차 전 취소는 전액 환불',
    body: `배차 전에는 전액, 배차 후 작업 시작 전에는 위약금 ${Math.round(
      CANCELLATION_PENALTY_RATE * 100,
    )}%를 제외하고 환불합니다.`,
  },
];

export function GuaranteeCard() {
  return (
    <>
      <SectionTitle>이용 전에 알아두세요</SectionTitle>
      <Card style={styles.card}>
        {GUARANTEES.map((item, index) => (
          <View key={item.title} style={[styles.row, index > 0 && styles.rowDivided]}>
            <View style={styles.indexPlate}>
              <Text style={[styles.indexText, TABULAR_NUMS]}>{item.code}</Text>
            </View>
            <View style={styles.textBox}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
            </View>
          </View>
        ))}
      </Card>
    </>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  card: {
    padding: 0,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    padding: spacing.md,
  },
  rowDivided: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  indexPlate: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.badge,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 36,
  },
  indexText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  textBox: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  body: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
    marginTop: spacing.xs / 2,
  },
});
