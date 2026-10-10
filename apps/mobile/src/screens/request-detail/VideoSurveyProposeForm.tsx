import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { VIDEO_SURVEY_COPY, VIDEO_SURVEY_MAX_PROPOSALS } from '@dimol/shared';
import { AppButton, Field } from '../../components/ui';
import { theme } from '../../theme';

/**
 * 업체 — 가능한 시간을 최대 N개 적어 영상통화 실사를 요청한다.
 * 입력 형식은 기존 실사 예약 칸과 같다("2026-09-20 14:00") — 같은 앱 안에서 형식이 다르면 헷갈린다.
 */
export function VideoSurveyProposeForm({
  busy,
  onSubmit,
  onInvalid,
}: {
  busy: boolean;
  onSubmit: (times: string[]) => void;
  onInvalid: (message: string) => void;
}) {
  const [inputs, setInputs] = useState<string[]>(() =>
    Array.from({ length: VIDEO_SURVEY_MAX_PROPOSALS }, () => ''),
  );

  function submit() {
    const filled = inputs.map((v) => v.trim()).filter(Boolean);
    const parsed = filled.map((raw) => new Date(raw.replace(' ', 'T')));
    if (filled.length === 0 || parsed.some((d) => Number.isNaN(d.getTime()))) {
      onInvalid('가능한 시간을 "2026-09-20 14:00" 형식으로 하나 이상 적어 주세요.');
      return;
    }
    onSubmit(parsed.map((d) => d.toISOString()));
  }

  return (
    <>
      <Text style={styles.hint}>
        현장에 가지 않고 영상으로 먼저 봅니다. 가능한 시간을 {VIDEO_SURVEY_MAX_PROPOSALS}개까지
        적어 주세요.
      </Text>
      {inputs.map((value, i) => (
        <Field
          key={i}
          label={`가능한 시간 ${i + 1}${i === 0 ? '' : ' (선택)'}`}
          value={value}
          onChangeText={(v) => setInputs((prev) => prev.map((p, j) => (j === i ? v : p)))}
          placeholder="예: 2026-09-20 14:00"
        />
      ))}
      <AppButton label={VIDEO_SURVEY_COPY.requestCall} loading={busy} onPress={submit} />
    </>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.font.body,
    lineHeight: theme.font.body * 1.5,
    marginBottom: theme.spacing.xs,
  },
});
