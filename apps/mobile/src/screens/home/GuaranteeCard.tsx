import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CANCELLATION_PENALTY_RATE } from '@dimol/shared';
import { AppIcon, type IconName } from '../../components/AppIcon';
import { Card, SectionTitle } from '../../components/ui';
import { theme } from '../../theme';

/**
 * "비움이 지키는 것" — 플랫폼이 **실제로 코드로 보장하는 규칙만** 적는다.
 *
 * 수치는 전부 공유 상수에서 가져온다. 정책이 바뀌면 문구도 같이 바뀌어야지,
 * 화면에 박아 둔 숫자와 실제 정산이 어긋나면 그대로 분쟁이 된다.
 */
const GUARANTEES: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'document',
    title: '올바로 전자인계서 자동 처리',
    body: '의무 대상이면 매칭과 동시에 전자인계서를 발행합니다. 올바로에 따로 로그인하지 않아도 됩니다.',
  },
  {
    icon: 'lock',
    title: '검증된 업체만 매칭',
    body: '사업자등록번호 확인과 관리자 승인을 거친 업체에게만 요청이 전달됩니다.',
  },
  {
    icon: 'check',
    title: '배차 전 취소는 전액 환불',
    body: `배차 전에는 전액, 배차 후 작업 시작 전에는 위약금 ${Math.round(
      CANCELLATION_PENALTY_RATE * 100,
    )}%를 제외하고 환불합니다.`,
  },
];

export function GuaranteeCard() {
  return (
    <>
      <SectionTitle>비움이 지키는 것</SectionTitle>
      <Card style={styles.card}>
        {GUARANTEES.map((item, index) => (
          <View key={item.title} style={[styles.row, index > 0 && styles.rowDivided]}>
            <View style={styles.icon}>
              <AppIcon name={item.icon} size={20} color={colors.primary} />
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
    flexDirection: 'row',
    padding: spacing.md,
  },
  rowDivided: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.badge,
    height: 40,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 40,
  },
  textBox: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '800',
  },
  body: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
    marginTop: spacing.xs / 2,
  },
});
