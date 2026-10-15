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

/** 단계 머리 — "1 / 4 · 현장 위치", 진행 막대, 그리고 이 단계의 질문 하나. */
export function StepHeader({ index }: { index: number }) {
  const step = DEMOLITION_STEPS[index]!;
  const total = DEMOLITION_STEPS.length;
  return (
    <View style={styles.wrap}>
      <Text style={styles.count}>
        {index + 1} / {total} · {step.label}
      </Text>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={`전체 ${total}단계 중 ${index + 1}단계`}
      >
        <View style={[styles.fill, { width: `${((index + 1) / total) * 100}%` }]} />
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
  count: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  track: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    height: 8,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  fill: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 8,
  },
  question: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
    lineHeight: 38,
    marginTop: spacing.md,
  },
});
