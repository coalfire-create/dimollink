import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, Field } from '../../components/ui';
import { theme } from '../../theme';

/**
 * 요청 취소 — 버튼 한 번에 끝내지 않고 사유와 정책을 보여준 뒤 확인을 받는다.
 *
 * 위약금이 붙을 수 있는 동작이라, 누르기 전에 얼마가 돌아오는지를 같은 화면에서 읽게 한다.
 * 노출 여부(언제까지 취소할 수 있는지)는 호출부가 shared 의 규칙으로 판단한다.
 */
export function CancelPanel({
  cancelling,
  onCancel,
}: {
  cancelling: boolean;
  onCancel: (reason: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');

  if (!confirming) {
    return (
      <AppButton
        label="요청 취소"
        variant="danger"
        style={styles.spaced}
        onPress={() => setConfirming(true)}
      />
    );
  }

  return (
    <Card style={styles.spaced}>
      <Text style={styles.title}>정말 취소하시겠어요?</Text>
      <Text style={styles.policy}>
        업체 배차 후에 취소하면 위약금 10%를 뺀 금액이 환불돼요. 배차 전에는 전액 환불돼요.
      </Text>
      <Field
        label="취소 사유 (선택)"
        value={reason}
        onChangeText={setReason}
        placeholder="예) 일정이 변경됐어요"
      />
      <AppButton
        label="요청 취소하기"
        variant="danger"
        onPress={() => onCancel(reason)}
        loading={cancelling}
      />
      <View style={styles.gap} />
      <AppButton label="돌아가기" variant="outline" onPress={() => setConfirming(false)} />
    </Card>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  spaced: {
    marginTop: theme.spacing.sm,
  },
  gap: {
    height: theme.spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  policy: {
    color: colors.textMuted,
    fontSize: font.body,
    marginBottom: spacing.sm,
  },
});
