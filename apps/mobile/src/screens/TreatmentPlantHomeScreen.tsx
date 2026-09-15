import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  offersTransportLabel,
  suggestedQuoteAmount,
  type ProviderJobs,
  type ProviderPricing,
  type ServiceRequest,
} from '@dimol/shared';
import { getPricing, listJobs, submitQuote } from '../api/client';
import {
  AppButton,
  Card,
  ErrorBanner,
  Field,
  SectionTitle,
  StatusBadge,
  InlineEmpty,
} from '../components/ui';
import { FadeInUp } from '../components/motion';
import { AppIcon } from '../components/AppIcon';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { MarketRateCard } from '../components/MarketRateCard';
import { useMarketRate } from './home/useMarketRate';
import { theme } from '../theme';

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
  const rate = useMarketRate(config.marketRateParty);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [quoteAmounts, setQuoteAmounts] = useState<Record<string, string>>({});
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [pricing, setPricing] = useState<ProviderPricing | null>(null);

  const load = useCallback(async () => {
    const [jobsRes, priceRes] = await Promise.allSettled([listJobs(user.id), getPricing(user.id)]);
    if (jobsRes.status === 'fulfilled' && jobsRes.value) setJobs(jobsRes.value);
    if (priceRes.status === 'fulfilled' && priceRes.value) setPricing(priceRes.value);
  }, [user.id, config.marketRateParty]);

  useEffect(() => {
    void load();
  }, [load]);

  // 저장된 단가가 있으면 미입력 견적칸에 예상 금액(단가 × 톤)을 기본값으로 채운다.
  useEffect(() => {
    if (!pricing || !jobs) return;
    setQuoteAmounts((prev) => {
      const next = { ...prev };
      for (const job of jobs.open) {
        if (!next[job.id]) {
          next[job.id] = String(
            suggestedQuoteAmount(user.userType, pricing.unitPrice, job.wasteTons),
          );
        }
      }
      return next;
    });
  }, [pricing, jobs, user.userType]);

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
              <Text style={styles.bannerSubtitle}>비움 파트너스</Text>
              {/* 운반요청 제공 여부 배지 — 마이페이지에서 켜고 끌 수 있어요. */}
              <View style={styles.transportBadge}>
                <AppIcon name="truck" size={18} color={theme.colors.background} />
                <Text style={styles.transportBadgeText}>
                  {offersTransportLabel(user.offersTransport)}
                </Text>
              </View>
            </View>
            <AppIcon name="recycle" size={48} color={theme.colors.background} />
          </View>
        </FadeInUp>

        <MarketRateCard rate={rate} party={config.marketRateParty} />

        <SectionTitle>새 반입 예약</SectionTitle>
        <ErrorBanner message={quoteError} />
        {jobs && jobs.open.length > 0 ? (
          jobs.open.map((job) => (
            <Card key={job.id}>
              <View style={styles.requestRow}>
                <Text style={styles.requestTitle}>{REQUEST_KIND_LABELS[job.kind]}</Text>
                {job.distanceKm != null ? (
                  <View style={styles.distanceRow}>
                    <AppIcon name="location" size={18} color={theme.colors.primary} />
                    <Text style={styles.distance}>{job.distanceKm}km</Text>
                  </View>
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
          <InlineEmpty>아직 들어온 반입 예약이 없어요.</InlineEmpty>
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
          <InlineEmpty>확정된 반입이 없어요.</InlineEmpty>
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
    // 마지막 항목이 우하단 고객센터 버튼에 가리지 않게 밑단을 비운다.
    paddingBottom: theme.floatingButtonClearance + spacing.md,
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
    color: colors.background,
    fontSize: font.title,
    fontWeight: '800',
    marginTop: spacing.xs / 2,
  },
  transportBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: spacing.xs / 2,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  transportBadgeText: {
    color: colors.background,
    fontSize: font.caption,
    fontWeight: '700',
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
  distanceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs / 2,
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
});
