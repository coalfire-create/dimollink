import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View, type ScrollView } from 'react-native';
import { DEMOLITION_STEPS, firstStepWithErrors } from '../../lib/demolition-form-steps';
import { theme } from '../../theme';
import type { RequestFormState } from './useRequestForm';

/**
 * 철거 신청 단계 이동 — 지금 몇 번째 단계인지, 다음/이전, 마지막의 접수.
 *
 * "다음"은 이 단계 칸만 검사한다(아직 안 본 단계 칸을 빨갛게 칠하지 않는다).
 * 마지막 "접수하기"는 전체를 다시 보고, 앞 단계에 오류가 남아 있으면 그 단계로 되돌린다 —
 * 임시 저장에서 이어 쓴 경우처럼 앞 단계를 건너뛰고 들어올 수 있어서다.
 */
export function useDemolitionSteps(form: RequestFormState) {
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const step = DEMOLITION_STEPS[index]!;
  const isLast = index === DEMOLITION_STEPS.length - 1;

  function goTo(next: number) {
    setIndex(next);
    // 새 질문은 화면 맨 위에서 시작한다 — 이전 단계의 스크롤 위치에 남으면 질문이 안 보인다.
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function next() {
    if (!form.checkFields(step.fields)) return;
    if (!isLast) {
      goTo(index + 1);
      return;
    }
    const back = firstStepWithErrors(form.allErrors());
    if (back >= 0) {
      goTo(back);
      form.checkFields(DEMOLITION_STEPS[back]!.fields);
      return;
    }
    void form.submit();
  }

  return {
    index,
    step,
    isFirst: index === 0,
    isLast,
    scrollRef,
    next,
    back: () => goTo(Math.max(0, index - 1)),
  };
}

/** 단계 머리 — 상단 스텝 인디케이터(① 위치 → ② 공간 → ③ 일정 → ④ 사진), 진행 막대, 질문. */
export function StepHeader({ index }: { index: number }) {
  const step = DEMOLITION_STEPS[index]!;
  const total = DEMOLITION_STEPS.length;
  const progressPercent = Math.round(((index + 1) / total) * 100);

  return (
    <View style={styles.wrap}>
      {/* 4단계 스텝 인디케이터 */}
      <View style={styles.stepperRow} accessibilityLabel={`현재 ${total}단계 중 ${index + 1}단계: ${step.label}`}>
        {DEMOLITION_STEPS.map((s, i) => {
          const isDone = i < index;
          const isCurrent = i === index;
          return (
            <React.Fragment key={s.key}>
              <View style={styles.stepItem}>
                <View
                  style={[
                    styles.stepCircle,
                    isDone && styles.stepCircleDone,
                    isCurrent && styles.stepCircleCurrent,
                  ]}
                >
                  <Text
                    style={[
                      styles.stepCircleText,
                      isDone && styles.stepCircleTextDone,
                      isCurrent && styles.stepCircleTextCurrent,
                    ]}
                  >
                    {isDone ? '✓' : i + 1}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    isDone && styles.stepLabelDone,
                    isCurrent && styles.stepLabelCurrent,
                  ]}
                  numberOfLines={1}
                >
                  {s.label}
                </Text>
              </View>
              {i < total - 1 ? (
                <View style={[styles.stepLine, i < index && styles.stepLineDone]} />
              ) : null}
            </React.Fragment>
          );
        })}
      </View>

      {/* 진행 상태 바 & 퍼센트 */}
      <View style={styles.progressRow}>
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityLabel={`전체 ${total}단계 중 ${index + 1}단계 (${progressPercent}%)`}
        >
          <View style={[styles.fill, { width: `${progressPercent}%` }]} />
        </View>
        <Text style={styles.percentText}>{progressPercent}%</Text>
      </View>

      <Text style={styles.question} accessibilityRole="header">
        {step.question}
      </Text>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  stepperRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  stepItem: {
    alignItems: 'center',
    gap: 4,
  },
  stepCircle: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1.5,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  stepCircleDone: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  stepCircleCurrent: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    elevation: 3,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  stepCircleText: {
    color: colors.textMuted,
    fontSize: theme.glyph.small,
    fontWeight: '700',
  },
  stepCircleTextDone: {
    color: colors.primary,
    fontWeight: '800',
  },
  stepCircleTextCurrent: {
    color: colors.background,
    fontWeight: '800',
  },
  stepLabel: {
    color: colors.textMuted,
    fontSize: theme.font.tabLabel,
    fontWeight: '500',
  },
  stepLabelDone: {
    color: colors.text,
    fontWeight: '600',
  },
  stepLabelCurrent: {
    color: colors.primary,
    fontWeight: '800',
  },
  stepLine: {
    backgroundColor: colors.border,
    flex: 1,
    height: 2,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.xs / 2,
  },
  stepLineDone: {
    backgroundColor: colors.primary,
  },
  progressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  track: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    flex: 1,
    height: 8,
    overflow: 'hidden',
  },
  fill: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 8,
  },
  percentText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'right',
  },
  question: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
    lineHeight: 38,
    marginTop: spacing.md,
  },
});
