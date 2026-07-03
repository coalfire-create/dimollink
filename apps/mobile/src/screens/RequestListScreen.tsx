import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS, type ServiceRequest } from '@dimol/shared';
import { ApiError, listRequests } from '../api/client';
import { Card, EmptyState, ErrorBanner, LoadingView, StatusBadge } from '../components/ui';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { theme } from '../theme';

/** 요청/작업/예약 목록 — 가입 유형별 제목 (roleConfig) + 상태 배지 (Phase 1 /requests). */

export function RequestListScreen() {
  const nav = useNavigation();
  const user = useSession();
  const config = ROLE_CONFIG[user.userType];
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
      <ScreenHeader title={config.listTitle} />
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
          ListEmptyComponent={<EmptyState title="아직 없어요" description={config.listEmpty} />}
          renderItem={({ item }) => (
            <Card onPress={() => nav.push({ name: 'requestDetail', requestId: item.id })}>
              <View style={styles.row}>
                <Text style={styles.title}>{REQUEST_KIND_LABELS[item.kind]}</Text>
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
