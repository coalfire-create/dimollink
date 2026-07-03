import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { REQUEST_STATUS_LABELS, type ServiceRequest } from '@dimol/shared';
import { ApiError, listRequests } from '../api/client';
import { Card, EmptyState, ErrorBanner, LoadingView, StatusBadge } from '../components/ui';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { theme } from '../theme';

/** 내 요청 목록 — 상태 배지 + 당겨서 새로고침 (Phase 1 /requests). */

const KIND_LABELS: Record<ServiceRequest['kind'], string> = {
  DEMOLITION: '철거 요청',
  TRANSPORT: '운반 요청',
  DISPOSAL_RESERVATION: '처리장 예약',
};

export function RequestListScreen() {
  const nav = useNavigation();
  const user = useSession();
  const [requests, setRequests] = useState<ServiceRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRequests(await listRequests(user.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '목록을 불러오지 못했습니다.');
      setRequests([]);
    }
  }, [user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="내 요청" />
      <ErrorBanner message={error} />
      {requests === null ? (
        <LoadingView />
      ) : (
        <FlatList
          contentContainerStyle={styles.content}
          data={requests}
          keyExtractor={(item) => item.id}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          ListEmptyComponent={
            <EmptyState
              title="아직 요청이 없어요"
              description="홈에서 철거·운반·처리장 예약을 시작해 보세요."
            />
          }
          renderItem={({ item }) => (
            <Card onPress={() => nav.push({ name: 'requestDetail', requestId: item.id })}>
              <View style={styles.row}>
                <Text style={styles.title}>{KIND_LABELS[item.kind]}</Text>
                <StatusBadge status={item.status} label={REQUEST_STATUS_LABELS[item.status]} />
              </View>
              <Text style={styles.meta}>
                {item.wasteTons}톤 · {new Date(item.createdAt).toLocaleDateString('ko-KR')} 접수
              </Text>
            </Card>
          )}
        />
      )}
      <TabBar active="requests" />
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: spacing.sm,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  meta: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
});
