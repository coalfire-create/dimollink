import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  CALL_AVAILABILITY_LABELS,
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  type CallAvailability,
  type MarketRate,
  type ProviderJobs,
  type ServiceRequest,
} from '@dimol/shared';
import {
  acceptJob,
  getMarketRate,
  listJobs,
  listRequests,
  setAvailability,
  submitQuote,
} from '../api/client';
import { AppButton, Card, ErrorBanner, Field, SectionTitle, StatusBadge } from '../components/ui';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { theme } from '../theme';

/** 홈 — 가입 유형별로 동작·일감 피드·목록이 다르게 뜬다 (roleConfig 참조). */

/** 시세 안내를 표시할 최소 견적 표본 수 (적으면 평균이 오해를 부른다). */
const MARKET_RATE_MIN_SAMPLE = 5;

const RATE_TITLE: Record<'TRANSPORT' | 'DISPOSAL', string> = {
  TRANSPORT: '요즘 운반 평균 시세',
  DISPOSAL: '요즘 처리 평균 시세',
};

/** 요청 종류별 한 줄 요약(주소/일시). */
function requestSubtitle(r: ServiceRequest): string {
  if (r.kind === 'DEMOLITION') return r.siteAddress;
  if (r.kind === 'TRANSPORT') return `${r.loadAddress} → ${r.unloadAddress}`;
  return new Date(r.visitAt).toLocaleString('ko-KR');
}

export function HomeScreen() {
  const nav = useNavigation();
  const user = useSession();
  const config = ROLE_CONFIG[user.userType];
  const { jobFeed, homeActive } = config;

  const [active, setActive] = useState<ServiceRequest[]>([]);
  const [jobs, setJobs] = useState<ProviderJobs | null>(null);
  const [rate, setRate] = useState<MarketRate | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [quoteAmounts, setQuoteAmounts] = useState<Record<string, string>>({});
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [availability, setLocalAvailability] = useState<CallAvailability>(
    user.availability ?? 'OFFLINE',
  );
  const [availBusy, setAvailBusy] = useState(false);

  const load = useCallback(async () => {
    // 홈 위젯 로딩 실패는 치명적이지 않다 — 조용히 비워 두고 당겨서 새로고침으로 복구.
    const [jobsRes, activeRes, rateRes] = await Promise.allSettled([
      config.jobFeed ? listJobs(user.id) : Promise.resolve(null),
      config.homeActive ? listRequests(user.id) : Promise.resolve(null),
      config.marketRateParty ? getMarketRate(config.marketRateParty) : Promise.resolve(null),
    ]);
    if (jobsRes.status === 'fulfilled' && jobsRes.value) setJobs(jobsRes.value);
    if (activeRes.status === 'fulfilled' && activeRes.value) {
      setActive(
        activeRes.value
          .filter((r) => r.status !== 'CANCELLED' && r.status !== 'SETTLED')
          .slice(0, 3),
      );
    }
    if (rateRes.status === 'fulfilled' && rateRes.value) setRate(rateRes.value);
  }, [user.id, config.jobFeed, config.homeActive, config.marketRateParty]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function toggleAvailability() {
    const next: CallAvailability = availability === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
    setAvailBusy(true);
    try {
      const updated = await setAvailability(user.id, next);
      setLocalAvailability(updated.availability ?? next);
      await load(); // 콜대기 켜면 새 콜을 다시 불러온다.
    } catch {
      // 실패 시 상태 유지 — 사용자가 다시 시도.
    } finally {
      setAvailBusy(false);
    }
  }

  // 선착순 수락(철거/운반) — 금액 입력 후 수락하면 그 금액이 합의 금액이 된다.
  async function accept(requestId: string) {
    setQuoteError(null);
    const amount = Number((quoteAmounts[requestId] ?? '').replace(/\D/g, ''));
    if (!Number.isInteger(amount) || amount <= 0) {
      setQuoteError('수락 금액(원)을 정확히 입력해 주세요.');
      return;
    }
    setAcceptingId(requestId);
    try {
      await acceptJob(requestId, amount);
      await load();
    } catch {
      // 이미 수락됨 등 — 새로고침으로 최신 상태 반영.
      await load();
    } finally {
      setAcceptingId(null);
    }
  }

  // 처리장 견적 제출(가격 비교 방식). 요청자가 여러 견적 중 선택한다.
  async function submitQuoteFor(requestId: string) {
    setQuoteError(null);
    const party = jobFeed?.quoteParty;
    const amount = Number((quoteAmounts[requestId] ?? '').replace(/\D/g, ''));
    if (!party) return;
    if (!Number.isInteger(amount) || amount <= 0) {
      setQuoteError('견적 금액(원)을 정확히 입력해 주세요.');
      return;
    }
    setAcceptingId(requestId);
    try {
      await submitQuote({ requestId, party, amount });
      setSubmittedIds((prev) => [...prev, requestId]);
    } catch {
      setQuoteError('견적 제출에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setAcceptingId(null);
    }
  }

  const online = availability === 'ONLINE';

  return (
    <View style={styles.screen}>
      <ScreenHeader title={`${user.name}${config.homeGreetingSuffix}`} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {config.showAvailability ? (
          <Card style={[styles.availCard, online && styles.availCardOn]}>
            <Text style={styles.availStatus}>
              {online ? '🟢 ' : '⚪ '}
              {CALL_AVAILABILITY_LABELS[availability]}
            </Text>
            <Text style={styles.availDescription}>
              {online
                ? '지금 들어오는 운반 콜을 받을 수 있어요.'
                : '콜대기를 켜면 운반 요청을 받을 수 있어요.'}
            </Text>
            <AppButton
              label={online ? '콜대기 끄기' : '콜대기 켜기'}
              variant={online ? 'outline' : 'primary'}
              onPress={toggleAvailability}
              loading={availBusy}
            />
          </Card>
        ) : null}

        {config.homeActions.length > 0 ? (
          <>
            {config.homeIntro ? <SectionTitle>{config.homeIntro}</SectionTitle> : null}
            {config.homeActions.map((action) => (
              <Card key={action.key} onPress={() => nav.push(action.route)}>
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
          </>
        ) : null}

        {config.marketRateParty &&
        rate &&
        rate.quoteCount >= MARKET_RATE_MIN_SAMPLE &&
        rate.averageAmount !== null ? (
          <Card style={styles.rateCard}>
            <Text style={styles.rateTitle}>{RATE_TITLE[config.marketRateParty]}</Text>
            <Text style={styles.rateAmount}>{rate.averageAmount.toLocaleString('ko-KR')}원</Text>
            <Text style={styles.rateNote}>최근 견적 {rate.quoteCount}건 기준 참고용이에요</Text>
          </Card>
        ) : null}

        {/* 업체 일감 피드 — 새 일감(수락 가능) + 수락한 일감 */}
        {jobFeed ? (
          <>
            <SectionTitle>{jobFeed.openTitle}</SectionTitle>
            <ErrorBanner message={quoteError} />
            {jobs && jobs.open.length > 0 ? (
              jobs.open.map((job) => (
                <Card key={job.id}>
                  <View style={styles.requestRow}>
                    <Text style={styles.requestTitle}>{REQUEST_KIND_LABELS[job.kind]}</Text>
                    {job.distanceKm != null ? (
                      <Text style={styles.distance}>📍 {job.distanceKm}km</Text>
                    ) : null}
                  </View>
                  <Text style={styles.requestMeta}>{requestSubtitle(job)}</Text>
                  <Text style={styles.requestMeta}>
                    {job.wasteTons}톤 · {new Date(job.createdAt).toLocaleDateString('ko-KR')}
                  </Text>
                  <View style={{ height: theme.spacing.xs }} />
                  {jobFeed.openMode === 'quote' && submittedIds.includes(job.id) ? (
                    <Text style={styles.quoteDone}>✓ 견적 제출됨 · 요청자 선택 대기</Text>
                  ) : (
                    <>
                      <Field
                        label={jobFeed.openMode === 'quote' ? '견적 금액(원)' : '수락 금액(원)'}
                        value={quoteAmounts[job.id] ?? ''}
                        onChangeText={(v) => setQuoteAmounts((p) => ({ ...p, [job.id]: v }))}
                        placeholder="예) 80000"
                        keyboardType="number-pad"
                      />
                      <AppButton
                        label={jobFeed.acceptLabel}
                        onPress={() =>
                          jobFeed.openMode === 'quote' ? submitQuoteFor(job.id) : accept(job.id)
                        }
                        loading={acceptingId === job.id}
                      />
                    </>
                  )}
                </Card>
              ))
            ) : (
              <Text style={styles.emptyText}>{jobFeed.openEmpty}</Text>
            )}

            <SectionTitle>{jobFeed.assignedTitle}</SectionTitle>
            {jobs && jobs.assigned.length > 0 ? (
              jobs.assigned.map((job) => (
                <Card
                  key={job.id}
                  onPress={() => nav.push({ name: 'requestDetail', requestId: job.id })}
                >
                  <View style={styles.requestRow}>
                    <Text style={styles.requestTitle}>{REQUEST_KIND_LABELS[job.kind]}</Text>
                    <StatusBadge status={job.status} label={REQUEST_STATUS_LABELS[job.status]} />
                  </View>
                  <Text style={styles.requestMeta}>
                    {job.wasteTons}톤 · {requestSubtitle(job)}
                  </Text>
                </Card>
              ))
            ) : (
              <Text style={styles.emptyText}>{jobFeed.assignedEmpty}</Text>
            )}
          </>
        ) : null}

        {/* 소비자 — 내가 올린 요청 진행 현황 */}
        {homeActive ? (
          <>
            <SectionTitle>{homeActive.title}</SectionTitle>
            {active.length > 0 ? (
              active.map((request) => (
                <Card
                  key={request.id}
                  onPress={() => nav.push({ name: 'requestDetail', requestId: request.id })}
                >
                  <View style={styles.requestRow}>
                    <Text style={styles.requestTitle}>{REQUEST_KIND_LABELS[request.kind]}</Text>
                    <StatusBadge
                      status={request.status}
                      label={REQUEST_STATUS_LABELS[request.status]}
                    />
                  </View>
                  <Text style={styles.requestMeta}>
                    {request.wasteTons}톤 · {new Date(request.createdAt).toLocaleDateString('ko-KR')}
                  </Text>
                </Card>
              ))
            ) : (
              <Text style={styles.emptyText}>{homeActive.empty}</Text>
            )}
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
  availCard: {
    borderColor: colors.border,
  },
  availCardOn: {
    backgroundColor: '#E7F3EC',
    borderColor: colors.primary,
  },
  availStatus: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
  },
  availDescription: {
    color: colors.textMuted,
    fontSize: font.body,
    marginBottom: spacing.sm,
    marginTop: spacing.xs / 2,
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
  distance: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  quoteDone: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
    paddingVertical: spacing.xs,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: font.body,
    paddingVertical: spacing.sm,
  },
});
