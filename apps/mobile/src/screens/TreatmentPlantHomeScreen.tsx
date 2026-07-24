import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS, type MarketRate, type ProviderJobs, type ServiceRequest } from '@dimol/shared';
import { getMarketRate, listJobs, submitQuote } from '../api/client';
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

export function TreatmentPlantHomeScreen() {
  const nav = useNavigation();
  const user = useSession();
  const config = ROLE_CONFIG.WASTE_TREATMENT_PLANT;

  const [jobs, setJobs] = useState<ProviderJobs | null>(null);
  const [rate, setRate] = useState<MarketRate | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [quoteAmounts, setQuoteAmounts] = useState<Record<string, string>>({});
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [jobsRes, rateRes] = await Promise.allSettled([
      listJobs(user.id),
      config.marketRateParty ? getMarketRate(config.marketRateParty) : Promise.resolve(null),
    ]);
    if (jobsRes.status === 'fulfilled' && jobsRes.value) setJobs(jobsRes.value);
    if (rateRes.status === 'fulfilled' && rateRes.value) setRate(rateRes.value);
  }, [user.id, config.marketRateParty]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function submitQuoteFor(requestId: string) {
    setQuoteError(null);
    const amount = Number((quoteAmounts[requestId] ?? '').replace(/\D/g, ''));
    if (!Number.isInteger(amount) || amount <= 0) {
      setQuoteError('견적 금액(원)을 정확히 입력해 주세요.');
      return;
    }
    setAcceptingId(requestId);
    try {
      await submitQuote({ requestId, party: 'DISPOSAL', amount });
      setSubmittedIds((prev) => [...prev, requestId]);
    } catch {
      setQuoteError('견적 제출에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setAcceptingId(null);
    }
  }

  const renderMarketRate = () => {
    if (
      config.marketRateParty &&
      rate &&
      rate.quoteCount >= MARKET_RATE_MIN_SAMPLE &&
      rate.averageAmount !== null
    ) {
      return (
        <Card style={styles.rateCard}>
          <Text style={styles.rateTitle}>요즘 처리 평균 시세</Text>
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
              <Text style={styles.bannerTitle}>정확하고 빠른 반입 처리</Text>
              <Text style={styles.bannerSubtitle}>디몰링크 파트너스</Text>
            </View>
            <Text style={{fontSize: 70, position: 'absolute', right: 20, bottom: 20}}>🏭</Text>
          </View>
        </FadeInUp>

        {renderMarketRate()}

        <SectionTitle>새 반입 예약</SectionTitle>
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
              {submittedIds.includes(job.id) ? (
                <Text style={styles.quoteDone}>✓ 견적 제출됨 · 요청자 선택 대기</Text>
              ) : (
                <>
                  <Field
                    label="견적 금액(원)"
                    value={quoteAmounts[job.id] ?? ''}
                    onChangeText={(v) => setQuoteAmounts((p) => ({ ...p, [job.id]: v }))}
                    placeholder="예) 80000"
                    keyboardType="number-pad"
                  />
                  <AppButton
                    label="견적 제출"
                    onPress={() => submitQuoteFor(job.id)}
                    loading={acceptingId === job.id}
                  />
                </>
              )}
            </Card>
          ))
        ) : (
          <Text style={styles.emptyText}>아직 들어온 반입 예약이 없어요.</Text>
        )}

        <SectionTitle>확정된 반입</SectionTitle>
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
          <Text style={styles.emptyText}>확정된 반입이 없어요.</Text>
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
