import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  INTERIOR_CATEGORY_LABELS,
  REQUEST_STATUS_LABELS,
  type InteriorRequest,
} from '@dimol/shared';
import { ApiError, listInteriorRequests } from '../api/client';
import { AppButton, Card, EmptyState, ErrorBanner, LoadingView, StatusBadge } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, useNavigation } from '../navigation';
import { theme } from '../theme';

/**
 * 인테리어 요청 목록 (파일럿 밖 · FEATURE_INTERIOR).
 * - scope=mine: 소비자가 올린 내 시공 요청(진행 상태 확인).
 * - scope=open: 인테리어 업체가 볼 수 있는 대기중 시공 요청(입찰 대상).
 */
export function InteriorListScreen({ scope }: { scope: 'mine' | 'open' }) {
  const nav = useNavigation();
  const [items, setItems] = useState<InteriorRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await listInteriorRequests(scope));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '목록을 불러오지 못했습니다.');
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const title = scope === 'mine' ? '내 인테리어 요청' : '들어온 시공 요청';

  return (
    <View style={styles.screen}>
      <ScreenHeader title={title} canGoBack />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {scope === 'mine' ? (
          <AppButton
            label="+ 새 시공 요청하기"
            onPress={() => nav.push({ name: 'interiorForm' })}
            style={{ marginBottom: theme.spacing.sm }}
          />
        ) : null}

        <ErrorBanner message={error} />

        {items === null && !error ? (
          <LoadingView />
        ) : items && items.length > 0 ? (
          items.map((r, i) => (
            <FadeInUp key={r.id} delay={40 + i * 50}>
              <Card onPress={() => nav.push({ name: 'interiorDetail', requestId: r.id })}>
                <View style={styles.row}>
                  <Text style={styles.title} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <StatusBadge status={r.status} label={REQUEST_STATUS_LABELS[r.status]} />
                </View>
                <Text style={styles.meta}>
                  {INTERIOR_CATEGORY_LABELS[r.category]} · {r.region}
                  {r.budget ? ` · 희망 ${r.budget.toLocaleString('ko-KR')}원` : ''}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {r.siteAddress}
                </Text>
              </Card>
            </FadeInUp>
          ))
        ) : items ? (
          <EmptyState
            icon="🛠️"
            title={scope === 'mine' ? '아직 요청이 없어요' : '들어온 요청이 없어요'}
            description={
              scope === 'mine'
                ? '위 버튼으로 인테리어 시공 요청을 시작해 보세요.'
                : '새 시공 요청이 들어오면 여기에 표시돼요.'
            }
          />
        ) : null}
      </ScrollView>
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
    padding: spacing.sm,
    paddingBottom: spacing.lg,
    flexGrow: 1,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    flexShrink: 1,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    marginRight: spacing.sm,
  },
  meta: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
});
