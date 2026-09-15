import React from 'react';
import { StyleSheet, Text } from 'react-native';
import type { ServiceRequest } from '@dimol/shared';
import { AppButton, Card, SectionTitle } from '../../components/ui';
import { theme } from '../../theme';

/**
 * 매칭된 업체의 작업 진행 버튼 — 작업 시작 / 작업 완료.
 *
 * 배출자에게는 보이지 않는다. 상태를 앞으로 미는 건 현장에 있는 쪽이고,
 * 대금을 내보내는 건 배출자다 — 두 권한을 섞지 않는다.
 */
export function ProviderWorkCard({
  request,
  advancing,
  onAdvance,
}: {
  request: ServiceRequest;
  advancing: boolean;
  onAdvance: (status: 'IN_PROGRESS' | 'COMPLETED') => void;
}) {
  if (request.status !== 'PAID' && request.status !== 'IN_PROGRESS') return null;
  const starting = request.status === 'PAID';

  return (
    <>
      <SectionTitle>작업 진행</SectionTitle>
      <Card>
        <Text style={styles.hint}>
          {starting ? '현장 도착 후 작업을 시작하세요.' : '작업이 끝나면 완료 처리하세요.'}
        </Text>
        <AppButton
          label={starting ? '작업 시작' : '작업 완료'}
          onPress={() => onAdvance(starting ? 'IN_PROGRESS' : 'COMPLETED')}
          loading={advancing}
        />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.font.body,
    marginBottom: theme.spacing.xs,
  },
});
