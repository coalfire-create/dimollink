import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { REQUEST_STATUS_LABELS, type MatchStatus } from '@dimol/shared';
import { theme } from '../theme';

/**
 * 진행 상태 타임라인 — "지금 어디까지 왔는지"를 글이 아니라 그림으로 보여준다.
 *
 * 상태 이름만 텍스트로 쓰면(예: "PAID → 결제완료") 다음에 무슨 일이 일어나는지,
 * 몇 단계가 남았는지가 안 보인다. 전체 단계를 깔아 두고 지나온 곳을 채우면
 * 남은 단계가 한눈에 들어온다.
 *
 * 취소(CANCELLED)는 단계가 아니라 **중간에 끊긴 상태**라 줄 위에 얹지 않고
 * 위쪽에 따로 알린다 — 취소된 건을 "정산완료 직전"처럼 보이게 하면 안 된다.
 */

export const REQUEST_TIMELINE: MatchStatus[] = [
  'REQUESTED',
  'MATCHED',
  'PAID',
  'IN_PROGRESS',
  'COMPLETED',
  'SETTLED',
];

/** 각 단계에서 사용자가 실제로 기다리는 일 — 라벨만으로는 안 보이는 부분을 채운다. */
const STEP_HINTS: Record<MatchStatus, string> = {
  REQUESTED: '업체들이 견적을 보내는 중이에요.',
  MATCHED: '업체가 정해졌어요. 결제하면 일정이 확정돼요.',
  PAID: '결제가 끝났어요. 작업일에 업체가 현장에 나가요.',
  IN_PROGRESS: '현장 작업이 진행 중이에요.',
  COMPLETED: '작업이 끝났어요. 확정하면 업체에 대금이 지급돼요.',
  SETTLED: '업체 정산까지 모두 끝났어요.',
  CANCELLED: '취소된 요청이에요.',
};

export function StatusTimeline({
  status,
  steps = REQUEST_TIMELINE,
}: {
  status: MatchStatus;
  steps?: MatchStatus[];
}) {
  const cancelled = status === 'CANCELLED';
  const activeIndex = cancelled ? -1 : steps.indexOf(status);

  return (
    <View style={styles.wrap}>
      {cancelled ? (
        <View style={styles.cancelledBanner}>
          <Text style={styles.cancelledText}>취소된 요청이에요. 더 이상 진행되지 않아요.</Text>
        </View>
      ) : null}

      {steps.map((step, index) => {
        const reached = !cancelled && index <= activeIndex;
        const isCurrent = !cancelled && index === activeIndex;
        const isLast = index === steps.length - 1;
        return (
          <View
            key={step}
            style={styles.row}
            accessibilityLabel={`${index + 1}단계 ${REQUEST_STATUS_LABELS[step]}${isCurrent ? ' — 현재 단계' : reached ? ' — 완료' : ' — 대기'}`}
          >
            <View style={styles.marker}>
              <View
                style={[styles.dot, reached && styles.dotReached, isCurrent && styles.dotCurrent]}
              >
                {reached && !isCurrent ? <Text style={styles.dotCheck}>✓</Text> : null}
              </View>
              {!isLast ? <View style={[styles.line, reached && styles.lineReached]} /> : null}
            </View>
            <View style={[styles.labelWrap, isLast && styles.labelWrapLast]}>
              <Text
                style={[
                  styles.label,
                  reached && styles.labelReached,
                  isCurrent && styles.labelCurrent,
                ]}
              >
                {REQUEST_STATUS_LABELS[step]}
              </Text>
              {isCurrent ? <Text style={styles.hint}>{STEP_HINTS[step]}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: spacing.xs,
  },
  cancelledBanner: {
    backgroundColor: colors.errorSoft,
    borderRadius: radius.button,
    marginBottom: spacing.sm,
    padding: spacing.xs,
  },
  cancelledText: {
    color: colors.error,
    fontSize: font.body,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
  },
  marker: {
    alignItems: 'center',
    width: 32,
  },
  dot: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  dotReached: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dotCurrent: {
    // 현재 단계만 크게 — 눈이 먼저 가는 지점을 하나로 만든다.
    borderColor: colors.primary,
    borderWidth: 6,
    backgroundColor: colors.background,
    height: 28,
    width: 28,
  },
  dotCheck: {
    color: colors.background,
    // 체크 표시는 읽는 글자가 아니라 점 안에 들어가는 기호라 glyph 토큰을 쓴다.
    fontSize: theme.glyph.small,
    fontWeight: '900',
    lineHeight: 16,
  },
  line: {
    backgroundColor: colors.border,
    flex: 1,
    marginVertical: 4,
    minHeight: 24,
    width: 2,
  },
  lineReached: {
    backgroundColor: colors.primary,
  },
  labelWrap: {
    flex: 1,
    paddingBottom: spacing.sm,
    paddingLeft: spacing.xs,
  },
  labelWrapLast: {
    paddingBottom: 0,
  },
  label: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
  labelReached: {
    color: colors.text,
    fontWeight: '700',
  },
  labelCurrent: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: 4,
  },
});
