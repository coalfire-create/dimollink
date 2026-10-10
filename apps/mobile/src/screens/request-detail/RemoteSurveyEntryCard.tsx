import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { AppButton, Card } from '../../components/ui';
import { useNavigation } from '../../navigation';
import { theme } from '../../theme';

/**
 * 원격 실사 입구 — 업체가 집에 오지 않아도 견적을 낼 수 있게 소비자가 직접 찍어 보낸다.
 * 철거 요청이 견적을 받는 중(REQUESTED)일 때만 보인다(그 뒤에는 금액이 이미 정해졌다).
 */
export function RemoteSurveyEntryCard({ requestId }: { requestId: string }) {
  const nav = useNavigation();
  return (
    <Card>
      <Text style={styles.title}>업체가 오지 않아도 돼요</Text>
      <Text style={styles.body}>
        안내대로 집 안팎을 찍어 보내면, 업체가 현장에 오지 않고 견적을 낼 수 있어요.
      </Text>
      <AppButton
        label="원격 실사 촬영하기"
        onPress={() => nav.push({ name: 'remoteSurvey', requestId })}
      />
    </Card>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  body: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 28,
    marginBottom: spacing.sm,
  },
});
