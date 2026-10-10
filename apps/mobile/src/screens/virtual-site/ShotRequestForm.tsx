import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  REMOTE_SURVEY_MAX_OPEN_SHOT_REQUESTS_PER_PROVIDER,
  REMOTE_SURVEY_TEXT_MAX,
  type RemoteSurveyItem,
} from '@dimol/shared';
import { AppButton, Field } from '../../components/ui';
import { theme } from '../../theme';

/**
 * "이것 더 찍어 주세요" — 현장에서 "저기 좀 보여주세요" 하던 것을 대신한다.
 * 문구는 소비자(고령자 다수)에게 그대로 보이므로, 무엇을 어디서 찍을지 한 문장으로 쓰게 안내한다.
 */
export function ShotRequestForm({
  item,
  canRequestMore,
  busy,
  onSubmit,
}: {
  item: RemoteSurveyItem;
  canRequestMore: boolean;
  busy: boolean;
  /** 성공하면 true — 입력칸을 닫는다. */
  onSubmit: (message: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  if (!canRequestMore) {
    return (
      <Text style={styles.limit}>
        답을 기다리는 요청이 {REMOTE_SURVEY_MAX_OPEN_SHOT_REQUESTS_PER_PROVIDER}건이라 더 보낼 수
        없어요. 신청자가 찍어 보내면 다시 요청할 수 있어요.
      </Text>
    );
  }

  if (!open) {
    return (
      <AppButton label="추가 촬영 요청" variant="outline" onPress={() => setOpen(true)} />
    );
  }

  const trimmed = message.trim();
  return (
    <View style={styles.form}>
      <Field
        label={`${item.title} — 무엇을 더 찍어 주면 될까요?`}
        value={message}
        onChangeText={setMessage}
        maxLength={REMOTE_SURVEY_TEXT_MAX}
        multiline
        placeholder="예: 지붕 가장자리를 가까이 한 장 더 찍어 주세요."
      />
      <AppButton
        label="요청 보내기"
        loading={busy}
        disabled={busy || trimmed.length === 0}
        onPress={() => {
          void onSubmit(trimmed).then((ok) => {
            if (ok) {
              setMessage('');
              setOpen(false);
            }
          });
        }}
      />
      <AppButton label="닫기" variant="outline" onPress={() => setOpen(false)} />
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  form: { gap: spacing.xs },
  limit: { color: colors.textMuted, fontSize: font.body, lineHeight: 28 },
});
