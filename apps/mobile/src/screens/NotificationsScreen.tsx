import React, { useCallback, useEffect, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import type { AppNotification } from '@dimol/shared';
import { ApiError, listNotifications } from '../api/client';
import { Card, EmptyState, ErrorBanner, LoadingView, SectionTitle } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { theme } from '../theme';

/**
 * 알림함 (Phase 4) — 상태 전이 시 서버가 생성한 알림을 최신순으로 보여준다.
 *
 * "오늘"과 "이전"으로 나눠 새 소식이 어디까지인지 보이게 한다. 예전에는 최근 알림을
 * 회색 바탕으로 칠했는데 화면 바닥도 회색이라 오히려 새 알림이 가장 흐리게 보였다.
 */

function statusDotColor(status: string): string {
  switch (status) {
    case 'MATCHED':
    case 'PAID':
    case 'IN_PROGRESS':
      return theme.colors.primary;
    case 'COMPLETED':
    case 'SETTLED':
      return theme.colors.success;
    case 'CANCELLED':
      return theme.colors.error;
    default:
      return theme.colors.textMuted;
  }
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function isRecent(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() < 24 * 60 * 60 * 1000;
}

export function NotificationsScreen() {
  const nav = useNavigation();
  const user = useSession();
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setNotifications(await listNotifications(user.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '알림을 불러오지 못했습니다.');
      setNotifications([]);
    }
  }, [user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="알림" />
      <ErrorBanner message={error} onRetry={() => void load()} />
      {notifications === null ? (
        <LoadingView />
      ) : (
        <SectionList
          contentContainerStyle={styles.content}
          sections={[
            { title: '오늘', data: notifications.filter((n) => isRecent(n.createdAt)) },
            { title: '이전', data: notifications.filter((n) => !isRecent(n.createdAt)) },
          ].filter((section) => section.data.length > 0)}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => <SectionTitle>{section.title}</SectionTitle>}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          ListEmptyComponent={
            <EmptyState
              icon="notifications"
              title="새 알림이 없어요"
              description="매칭·결제·작업 소식이 오면 여기에 떠요."
            />
          }
          renderItem={({ item, index }) => (
            <FadeInUp delay={Math.min(index, 6) * 60}>
              <Card onPress={() => nav.push({ name: 'requestDetail', requestId: item.requestId })}>
                <View style={styles.itemRow}>
                  <View
                    style={[styles.statusDot, { backgroundColor: statusDotColor(item.status) }]}
                  />
                  <View style={styles.itemContent}>
                    <Text style={styles.message}>{item.message}</Text>
                    <Text style={styles.time}>
                      {isRecent(item.createdAt) ? (
                        <Text style={styles.newLabel}>새 소식 · </Text>
                      ) : null}
                      {relativeTime(item.createdAt)}
                    </Text>
                  </View>
                </View>
              </Card>
            </FadeInUp>
          )}
        />
      )}
      <TabBar active="notifications" />
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.appBackground,
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.sm,
    // 마지막 항목이 우하단 고객센터 버튼에 가리지 않게 밑단을 비운다.
    paddingBottom: theme.floatingButtonClearance + spacing.md,
  },
  newLabel: {
    color: colors.primary,
    fontWeight: '700',
  },
  itemRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  statusDot: {
    borderRadius: 999,
    height: 8,
    marginRight: spacing.sm,
    marginTop: spacing.xs,
    width: 8,
  },
  itemContent: {
    flex: 1,
  },
  message: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '600',
    lineHeight: font.bodyLarge * 1.4,
  },
  time: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
  },
});
