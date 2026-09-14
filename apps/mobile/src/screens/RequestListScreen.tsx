import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS, type ServiceRequest } from '@dimol/shared';
import { ApiError, listRequests } from '../api/client';
import { EmptyState, ErrorBanner, LoadingView, StatusBadge } from '../components/ui';
import { AppIcon, type IconName } from '../components/AppIcon';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { theme } from '../theme';

/** 요청/작업/예약 목록 — 가입 유형별 제목 (roleConfig) + 상태 배지 (Phase 1 /requests). */

type RequestKindKey = 'DEMOLITION' | 'TRANSPORT' | 'INTERIOR' | 'DISPOSAL';

/**
 * 요청 종류 → 아이콘.
 *
 * 예전에는 이모지(🏗️🚚🛠️♻️)를 썼는데, 같은 이모지도 안드로이드·iOS·폰트 버전마다
 * 모양과 크기가 달라 목록이 기기별로 다르게 보였다. 앱 전체가 쓰는 아이콘 세트로 맞춘다.
 */
const KIND_ICON: Record<string, IconName> = {
  DEMOLITION: 'hammer',
  TRANSPORT: 'truck',
  INTERIOR: 'tools',
  DISPOSAL: 'recycle',
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
      <ErrorBanner message={error} onRetry={() => void load()} />
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
          ListEmptyComponent={
            // 빈 화면에서 "홈으로 가세요"라고 글로만 안내하면 사용자가 직접 탭을 찾아야 한다.
            <EmptyState
              icon="requests"
              title="아직 요청이 없어요"
              description={config.listEmpty}
              actionLabel={user.userType === 'CONSUMER' ? '철거 요청하기' : undefined}
              onAction={
                user.userType === 'CONSUMER'
                  ? () => nav.push({ name: 'requestForm', kind: 'DEMOLITION' })
                  : undefined
              }
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => nav.push({ name: 'requestDetail', requestId: item.id })}
              style={({ pressed }) => [styles.cardWrapper, pressed && styles.cardWrapperPressed]}
            >
              <View style={styles.accentBar} />
              <View style={styles.cardInner}>
                <View style={styles.kindBadge}>
                  <AppIcon
                    name={KIND_ICON[item.kind as RequestKindKey] ?? 'document'}
                    size={24}
                    color={theme.colors.primary}
                  />
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
    // 마지막 항목이 우하단 고객센터 버튼에 가리지 않게 밑단을 비운다.
    paddingBottom: theme.floatingButtonClearance + spacing.md,
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
    shadowColor: theme.colors.shadow,
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
    marginTop: spacing.xs / 2,
  },
  meta: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
  },
});
