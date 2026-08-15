import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CALL_AVAILABILITY_LABELS, REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS, suggestedQuoteAmount, type CallAvailability, type MarketRate, type ProviderJobs, type ProviderPricing, type ServiceRequest } from '@dimol/shared';
import { acceptJob, getMarketRate, getPricing, listJobs, setAvailability } from '../api/client';
import { AppButton, Card, ErrorBanner, Field, SectionTitle, StatusBadge } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { theme } from '../theme';

const MARKET_RATE_MIN_SAMPLE = 5;

function requestSubtitle(r: ServiceRequest): string {
  if (r.kind === 'DEMOLITION') return r.siteAddress;
  if (r.kind === 'TRANSPORT') return `${r.loadAddress} → ${r.unloadAddress}`;
  return new Date(r.visitAt).toLocaleString('ko-KR');
}

export function TransportHomeScreen() {
  const nav = useNavigation();
  const user = useSession();
  const config = ROLE_CONFIG.TRANSPORT_COMPANY;

  const [jobs, setJobs] = useState<ProviderJobs | null>(null);
  const [rate, setRate] = useState<MarketRate | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [quoteAmounts, setQuoteAmounts] = useState<Record<string, string>>({});
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [availability, setLocalAvailability] = useState<CallAvailability>(
    user.availability ?? 'OFFLINE',
  );
  const [availBusy, setAvailBusy] = useState(false);
  const [pricing, setPricing] = useState<ProviderPricing | null>(null);

  const load = useCallback(async () => {
    const [jobsRes, rateRes, priceRes] = await Promise.allSettled([
      listJobs(user.id),
      config.marketRateParty ? getMarketRate(config.marketRateParty) : Promise.resolve(null),
      getPricing(user.id),
    ]);
    if (jobsRes.status === 'fulfilled' && jobsRes.value) setJobs(jobsRes.value);
    if (rateRes.status === 'fulfilled' && rateRes.value) setRate(rateRes.value);
    if (priceRes.status === 'fulfilled' && priceRes.value) setPricing(priceRes.value);
  }, [user.id, config.marketRateParty]);

  // 저장된 단가가 있으면 미입력 수락금액 칸에 예상 금액(단가 × 톤)을 기본값으로 채운다.
  useEffect(() => {
    if (!pricing || !jobs) return;
    setQuoteAmounts((prev) => {
      const next = { ...prev };
      for (const job of jobs.open) {
        if (!next[job.id]) {
          next[job.id] = String(suggestedQuoteAmount(user.userType, pricing.unitPrice, job.wasteTons));
        }
      }
      return next;
    });
  }, [pricing, jobs, user.userType]);

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
      await load();
    } catch {
      // 콜대기 토글 실패는 조용히 무시(다음 새로고침에 상태 반영).
    } finally {
      setAvailBusy(false);
    }
  }

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
      await load();
    } finally {
      setAcceptingId(null);
    }
  }

  const online = availability === 'ONLINE';

  const renderMarketRate = () => {
    if (
      config.marketRateParty &&
      rate &&
      rate.quoteCount >= MARKET_RATE_MIN_SAMPLE &&
      rate.averageAmount !== null
    ) {
      return (
        <Card style={styles.rateCard}>
          <Text style={styles.rateTitle}>요즘 운반 평균 시세</Text>
          <Text style={styles.rateAmount}>{rate.averageAmount.toLocaleString('ko-KR')}원</Text>
          <Text style={styles.rateNote}>최근 견적 {rate.quoteCount}건 기준 참고용이에요</Text>
        </Card>
      );
    }
    return null;
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title={`${user.name}${config.homeGreetingSuffix}`} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <FadeInUp delay={20}>
          <View style={styles.bannerContainer}>
            <View style={styles.bannerLeft}>
              <Text style={styles.bannerTitle}>안전하고 신속한 운반</Text>
              <Text style={styles.bannerSubtitle}>비움 파트너스</Text>
            </View>
            <Text style={{fontSize: 70, position: 'absolute', right: 20, bottom: 20}}>🚚</Text>
          </View>
        </FadeInUp>
        <FadeInUp delay={60}>
          <Card style={[styles.availCard, online && styles.availCardOn]}>
            <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20}}>
              <View>
                <Text style={styles.availStatus}>
                  {online ? '🟢 ' : '⚪ '}
                  {CALL_AVAILABILITY_LABELS[availability]}
                </Text>
                <Text style={styles.availDescription}>
                  {online ? '운반 콜을 대기하고 있어요' : '콜대기를 켜면 운반 콜을 받을 수 있어요'}
                </Text>
              </View>
              <Text style={{fontSize: 48}}>{online ? '📡' : '💤'}</Text>
            </View>
            <AppButton
              label={online ? '콜대기 끄기' : '콜대기 켜기'}
              variant={online ? 'outline' : 'primary'}
              onPress={toggleAvailability}
              loading={availBusy}
            />
          </Card>
        </FadeInUp>

        {renderMarketRate()}

        <SectionTitle>들어온 운반 콜</SectionTitle>
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
              <Field
                label="수락 금액(원)"
                value={quoteAmounts[job.id] ?? ''}
                onChangeText={(v) => setQuoteAmounts((p) => ({ ...p, [job.id]: v }))}
                placeholder="예) 80000"
                keyboardType="number-pad"
              />
              <AppButton
                label="콜 수락하기"
                onPress={() => accept(job.id)}
                loading={acceptingId === job.id}
              />
            </Card>
          ))
        ) : (
          <Text style={styles.emptyText}>아직 들어온 콜이 없어요. 콜대기를 켜두면 요청이 들어와요.</Text>
        )}

        <SectionTitle>수락한 콜</SectionTitle>
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
          <Text style={styles.emptyText}>수락한 콜이 없어요.</Text>
        )}
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
  bannerContainer: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    margin: spacing.sm,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
    height: 120,
  },
  bannerLeft: {
    flex: 1,
    zIndex: 2,
  },
  bannerTitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: font.body,
    fontWeight: '600',
  },
  bannerSubtitle: {
    color: '#FFFFFF',
    fontSize: font.title,
    fontWeight: '800',
    marginTop: 4,
  },
  availCard: {
    borderColor: colors.border,
    borderWidth: 2,
    marginHorizontal: spacing.sm,
    padding: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.background,
  },
  availCardOn: {
    backgroundColor: '#E7EFFC',
    borderColor: colors.primary,
  },
  availStatus: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
  availDescription: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: 4,
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
  emptyText: {
    color: colors.textMuted,
    fontSize: font.body,
    paddingVertical: spacing.sm,
  },
});
