import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { ServiceRequest } from '@dimol/shared';
import { listRequests } from '../api/client';
import { requestsKey } from '../api/queryKeys';
import { useQuery } from '../lib/query';
import {
  buildDashboardPage,
  type PeriodFilter,
  type SortKey,
  type StatusFilter,
} from '../lib/request-filters';
import { EmptyState, ErrorBanner } from '../components/ui';
import { RequestListSkeleton } from '../components/Skeleton';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { RequestFilterBar } from './requests/RequestFilterBar';
import { RequestRow } from './requests/RequestRow';
import { Pagination } from './requests/Pagination';
import { theme } from '../theme';

/**
 * 통합 요청 대시보드 — 내 요청/작업을 한 화면에서 관리한다.
 *
 * 예전에는 서버가 준 순서 그대로의 목록 하나가 전부였다. 건수가 늘면 진행 중인 건을
 * 스크롤로 찾아야 했고, 끝난 건과 취소된 건이 그 사이에 섞여 있었다.
 * 지금은 상태 탭 · 기간 · 정렬 · 페이지로 좁힌다. 좁히는 규칙은 화면이 아니라
 * [[request-filters]] 에 있고, 여기서는 "무엇을 고르게 할지"와 배치만 다룬다.
 *
 * 데이터는 [[query]] 캐시를 거치므로, 상세를 보고 돌아와도 목록이 다시 비지 않는다.
 */

const PAGE_SIZE = 10;

export function RequestListScreen() {
  const nav = useNavigation();
  const user = useSession();
  const config = ROLE_CONFIG[user.userType];
  const primaryAction = config.primaryAction;

  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [period, setPeriod] = useState<PeriodFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('NEWEST');
  const [page, setPage] = useState(0);

  const { data, error, isLoading, isFetching, refetch } = useQuery<ServiceRequest[]>(
    requestsKey.list(user.id),
    () => listRequests(user.id),
  );

  const view = useMemo(
    () => buildDashboardPage(data ?? [], { status, period, sort, page, pageSize: PAGE_SIZE }),
    [data, status, period, sort, page],
  );

  // 필터를 바꾸면 항상 1페이지부터 — 3페이지를 보다 탭을 바꾸면 빈 화면이 뜬다.
  function changeFilter<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(0);
    };
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={config.listTitle} />
      <ErrorBanner message={error ? error.message : null} onRetry={() => void refetch()} />

      <RequestFilterBar
        status={status}
        period={period}
        sort={sort}
        counts={view.counts}
        onChangeStatus={changeFilter(setStatus)}
        onChangePeriod={changeFilter(setPeriod)}
        onChangeSort={changeFilter(setSort)}
      />

      {isLoading ? (
        <RequestListSkeleton />
      ) : (
        <FlatList
          contentContainerStyle={styles.content}
          data={view.items}
          keyExtractor={(item) => item.id}
          refreshing={isFetching}
          onRefresh={() => void refetch()}
          ListEmptyComponent={
            // 빈 화면에서 "홈으로 가세요"라고 글로만 안내하면 사용자가 직접 탭을 찾아야 한다.
            <EmptyState
              icon="requests"
              title={status === 'ALL' ? '아직 요청이 없어요' : '조건에 맞는 건이 없어요'}
              description={status === 'ALL' ? config.listEmpty : '탭이나 기간을 바꿔서 찾아보세요.'}
              // 처음 쓰는 사람은 여기서 바로 시작한다(홈에도 같은 버튼이 있다).
              actionLabel={status === 'ALL' && primaryAction ? primaryAction.label : undefined}
              onAction={
                primaryAction
                  ? () => nav.push({ name: 'requestForm', kind: primaryAction.kind })
                  : undefined
              }
            />
          }
          ListFooterComponent={
            <Pagination
              page={view.page}
              totalPages={view.totalPages}
              total={view.total}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          }
          renderItem={({ item }) => (
            <RequestRow
              request={item}
              onPress={() => nav.push({ name: 'requestDetail', requestId: item.id })}
            />
          )}
        />
      )}

      {/* 갱신 중에도 목록은 그대로 두고, 위쪽에 조용히 표시만 한다. */}
      {isFetching && !isLoading ? <Text style={styles.refreshing}>새로고침 중…</Text> : null}

      <TabBar active="requests" />
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
    padding: spacing.sm,
    // 마지막 항목이 우하단 고객센터 버튼에 가리지 않게 밑단을 비운다.
    paddingBottom: theme.floatingButtonClearance + spacing.md,
  },
  refreshing: {
    backgroundColor: colors.primarySoft,
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
    paddingVertical: spacing.xs,
    textAlign: 'center',
  },
});
