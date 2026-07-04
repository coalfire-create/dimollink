import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { REQUEST_STATUS_LABELS, type AppNotification } from '@dimol/shared';
import { ApiError, listNotifications } from '../api/client';
import { Card, EmptyState, ErrorBanner, LoadingView, StatusBadge } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { theme } from '../theme';

/** 알림함 (Phase 4) — 상태 전이 시 서버가 생성한 알림을 최신순으로 보여준다. */

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
      <ErrorBanner message={error} />
      {notifications === null ? (
        <LoadingView />
      ) : (
        <FlatList
          contentContainerStyle={styles.content}
          data={notifications}
          keyExtractor={(item) => item.id}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          ListEmptyComponent={
            <EmptyState
              icon="🔔"
              title="새 알림이 없어요"
              description="매칭·결제·작업 소식이 오면 여기에 떠요."
            />
          }
          renderItem={({ item, index }) => (
            <FadeInUp delay={Math.min(index, 6) * 60}>
              <Card onPress={() => nav.push({ name: 'requestDetail', requestId: item.requestId })}>
                <StatusBadge status={item.status} label={REQUEST_STATUS_LABELS[item.status]} />
                <Text style={styles.message}>{item.message}</Text>
                <Text style={styles.time}>
                  {new Date(item.createdAt).toLocaleString('ko-KR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </Text>
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
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: spacing.md,
  },
  message: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  time: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs,
  },
});
