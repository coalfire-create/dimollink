import React, { useCallback, useState } from 'react';
import { Alert, Text } from 'react-native';
import {
  adminAllbaroFailures,
  adminAllbaroQueue,
  adminAllbaroRetryNow,
  adminAllbaroRetryOne,
  type AdminRetryItem,
} from '../../api/client';
import { AppButton, Card, SectionTitle } from '../../components/ui';
import { Empty, Hint, adminStyles as s, errorMessage, useAdminList } from './shared';
import type { AdminTabProps } from './shared';

/**
 * 올바로 전자인계서 재시도 큐.
 *
 * 여기 쌓인 건 발행에 실패한 인계서라, 그대로 두면 법정 미신고가 된다.
 * 5분마다 스케줄러가 자동으로 돌지만, 운영자가 지금 바로 돌릴 수도 있어야 한다.
 */
export function AllbaroTab({ token, onError }: AdminTabProps) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadQueue = useCallback(() => adminAllbaroQueue(token), [token]);
  const loadFailures = useCallback(() => adminAllbaroFailures(token), [token]);
  const queue = useAdminList<AdminRetryItem>(loadQueue, onError, '큐 조회에 실패했습니다.');
  const failures = useAdminList<AdminRetryItem>(loadFailures, onError, '실패 목록 조회에 실패했습니다.');

  function refresh() {
    queue.reload();
    failures.reload();
  }

  async function retryAll() {
    setBusyId('retry-all');
    try {
      const summary = await adminAllbaroRetryNow(token);
      refresh();
      Alert.alert(
        '재시도 완료',
        `성공 ${summary.succeeded} · 재적재 ${summary.requeued} · 소진 ${summary.exhausted}`,
      );
    } catch (err) {
      onError(errorMessage(err, '재시도에 실패했습니다.'));
    } finally {
      setBusyId(null);
    }
  }

  async function retryOne(item: AdminRetryItem) {
    setBusyId(item.id);
    try {
      await adminAllbaroRetryOne(token, item.id);
      refresh();
    } catch (err) {
      onError(errorMessage(err, '재처리에 실패했습니다.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <SectionTitle>재시도 큐 ({queue.items.length})</SectionTitle>
      <Hint>
        발행에 실패한 전자인계서입니다. 5분마다 자동으로 재시도하며, 아래 버튼으로 지금 바로
        처리할 수도 있습니다.
      </Hint>
      <AppButton label="지금 재시도" onPress={retryAll} loading={busyId === 'retry-all'} />
      {queue.items.length === 0 ? (
        <Empty>큐가 비어 있어요.</Empty>
      ) : (
        queue.items.map((item) => (
          <Card key={item.id}>
            <Text style={s.name}>{item.matchRequestId}</Text>
            <Text style={s.meta}>
              {item.status} · 시도 {item.attempts}/{item.maxAttempts}
              {item.lastError ? ` · ${item.lastError}` : ''}
            </Text>
          </Card>
        ))
      )}

      <SectionTitle>수동 재처리 대상 ({failures.items.length})</SectionTitle>
      <Hint>재시도를 다 쓴 건입니다. 법정 신고 의무가 걸린 건이라 그대로 두면 안 됩니다.</Hint>
      {failures.items.length === 0 ? (
        <Empty>소진된 건이 없어요.</Empty>
      ) : (
        failures.items.map((item) => (
          <Card key={item.id}>
            <Text style={s.name}>{item.matchRequestId}</Text>
            <Text style={s.meta}>{item.lastError ?? '사유 없음'}</Text>
            <AppButton
              label="다시 시도"
              onPress={() => void retryOne(item)}
              loading={busyId === item.id}
            />
          </Card>
        ))
      )}
    </>
  );
}
