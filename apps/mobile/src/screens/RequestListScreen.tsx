import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS, type ServiceRequest } from '@dimol/shared';
import { ApiError, listRequests } from '../api/client';
import { Card, EmptyState, ErrorBanner, LoadingView, StatusBadge } from '../components/ui';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { theme } from '../theme';

/** 요청/작업/예약 목록 — 가입 유형별 제목 (roleConfig) + 상태 배지 (Phase 1 /requests). */

type RequestKindKey = 'DEMOLITION' | 'TRANSPORT' | 'INTERIOR' | 'DISPOSAL';

const KIND_ICON: Record<string, string> = {
  DEMOLITION: '🏗️',
  TRANSPORT: '🚚',
  INTERIOR: '🛠️',
  DISPOSAL: '♻️',
};

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
          ListHeaderComponent={
            requests.length > 0 ? (
              <Text style={styles.totalCount}>총 {requests.length}건</Text>
            ) : null
          }
          ListEmptyComponent={<EmptyState title="아직 없어요" description={config.listEmpty} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => nav.push({ name: 'requestDetail', requestId: item.id })}
              style={({ pressed }) => [styles.cardWrapper, pressed && styles.cardWrapperPressed]}
            >
              <View style={styles.accentBar} />
              <View style={styles.cardInner}>
                <View style={styles.kindBadge}>
                  <Text style={styles.kindIcon}>{KIND_ICON[item.kind as RequestKindKey] ?? '📦'}</Text>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.topRow}>
                    <Text style={styles.title}>{REQUEST_KIND_LABELS[item.kind]}</Text>
                    <View style={styles.topRowRight}>
                      <StatusBadge status={item.status} label={REQUEST_STATUS_LABELS[item.status]} />
                      <Text style={styles.chevron}>›</Text>
                    </View>
                  </View>
                  <Text style={styles.tons}>{item.wasteTons}톤</Text>
                  <Text style={styles.meta}>
                    {new Date(item.createdAt).toLocaleDateString('ko-KR')} 접수
                  </Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
      <TabBar active="requests" />
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.surface,
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: spacing.sm,
    paddingTop: spacing.xs,
  },
  totalCount: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  cardWrapper: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    overflow: 'hidden',
    shadowColor: '#0B1B3A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardWrapperPressed: {
    opacity: 0.92,
  },
  accentBar: {
    backgroundColor: colors.primary,
    width: 3,
  },
  cardInner: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    padding: spacing.sm,
  },
  kindBadge: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    height: 48,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 48,
  },
  kindIcon: {
    fontSize: font.bodyLarge,
  },
  cardBody: {
    flex: 1,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  topRowRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  chevron: {
    color: colors.textMuted,
    fontSize: font.title,
  },
  tons: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    marginTop: 4,
  },
  meta: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: 2,
  },
});
