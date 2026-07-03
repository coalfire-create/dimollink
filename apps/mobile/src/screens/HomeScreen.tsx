import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  REQUEST_STATUS_LABELS,
  type MarketRate,
  type RequestKind,
  type ServiceRequest,
} from '@dimol/shared';
import { getMarketRate, listRequests } from '../api/client';
import { Card, SectionTitle, StatusBadge } from '../components/ui';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { theme } from '../theme';

/** 홈 — 핵심 동작(요청 3종) + 진행중 요청 + 평균 시세 안내. */

const ACTIONS: Array<{ kind: RequestKind; icon: string; title: string; description: string }> = [
  { kind: 'DEMOLITION', icon: '🏚️', title: '철거 요청', description: '건물·구조물 철거를 맡겨요' },
  { kind: 'TRANSPORT', icon: '🚚', title: '운반 요청', description: '폐기물 운반 차량을 불러요' },
  {
    kind: 'DISPOSAL_RESERVATION',
    icon: '♻️',
    title: '처리장 예약',
    description: '폐기물 반입 일정을 잡아요',
  },
];

/** 시세 안내를 표시할 최소 견적 표본 수 (적으면 평균이 오해를 부른다). */
const MARKET_RATE_MIN_SAMPLE = 5;

export function HomeScreen() {
  const nav = useNavigation();
  const user = useSession();
  const [active, setActive] = useState<ServiceRequest[]>([]);
  const [rate, setRate] = useState<MarketRate | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // 홈 위젯 로딩 실패는 치명적이지 않다 — 조용히 비워 두고 당겨서 새로고침으로 복구.
    const [requests, marketRate] = await Promise.allSettled([
      listRequests(user.id),
      getMarketRate('TRANSPORT'),
    ]);
    if (requests.status === 'fulfilled') {
      setActive(
        requests.value.filter((r) => r.status !== 'CANCELLED' && r.status !== 'SETTLED').slice(0, 3),
      );
    }
    if (marketRate.status === 'fulfilled') setRate(marketRate.value);
  }, [user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={`${user.name}님, 안녕하세요`} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <SectionTitle>무엇을 도와드릴까요?</SectionTitle>
        {ACTIONS.map((action) => (
          <Card key={action.kind} onPress={() => nav.push({ name: 'requestForm', kind: action.kind })}>
            <View style={styles.actionRow}>
              <Text style={styles.actionIcon}>{action.icon}</Text>
              <View style={styles.actionTextBox}>
                <Text style={styles.actionTitle}>{action.title}</Text>
                <Text style={styles.actionDescription}>{action.description}</Text>
              </View>
              <Text style={styles.actionChevron}>›</Text>
            </View>
          </Card>
        ))}

        <Card onPress={() => nav.push({ name: 'estimate' })}>
          <View style={styles.actionRow}>
            <Text style={styles.actionIcon}>📐</Text>
            <View style={styles.actionTextBox}>
              <Text style={styles.actionTitle}>폐기물 양 미리 계산</Text>
              <Text style={styles.actionDescription}>건물 면적으로 대략적인 양을 알아봐요</Text>
            </View>
            <Text style={styles.actionChevron}>›</Text>
          </View>
        </Card>

        {rate && rate.quoteCount >= MARKET_RATE_MIN_SAMPLE && rate.averageAmount !== null ? (
          <Card style={styles.rateCard}>
            <Text style={styles.rateTitle}>요즘 운반 평균 시세</Text>
            <Text style={styles.rateAmount}>{rate.averageAmount.toLocaleString('ko-KR')}원</Text>
            <Text style={styles.rateNote}>최근 견적 {rate.quoteCount}건 기준 참고용이에요</Text>
          </Card>
        ) : null}

        {active.length > 0 ? (
          <>
            <SectionTitle>진행중인 요청</SectionTitle>
            {active.map((request) => (
              <Card
                key={request.id}
                onPress={() => nav.push({ name: 'requestDetail', requestId: request.id })}
              >
                <View style={styles.requestRow}>
                  <Text style={styles.requestTitle}>
                    {ACTIONS.find((a) => a.kind === request.kind)?.title ?? request.kind}
                  </Text>
                  <StatusBadge status={request.status} label={REQUEST_STATUS_LABELS[request.status]} />
                </View>
                <Text style={styles.requestMeta}>
                  {request.wasteTons}톤 · {new Date(request.createdAt).toLocaleDateString('ko-KR')}
                </Text>
              </Card>
            ))}
          </>
        ) : null}
      </ScrollView>
      <TabBar active="home" />
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
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  actionIcon: {
    fontSize: font.titleLarge,
    marginRight: spacing.sm,
  },
  actionTextBox: {
    flex: 1,
  },
  actionTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  actionDescription: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
  actionChevron: {
    color: colors.textMuted,
    fontSize: font.titleLarge,
  },
  rateCard: {
    backgroundColor: colors.surface,
    marginTop: spacing.sm,
  },
  rateTitle: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
  rateAmount: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
    marginVertical: spacing.xs / 2,
  },
  rateNote: {
    color: colors.textMuted,
    fontSize: font.caption,
  },
  requestRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  requestTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  requestMeta: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
});
