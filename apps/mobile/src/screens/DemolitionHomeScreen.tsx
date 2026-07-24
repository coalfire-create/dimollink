import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS, type MarketRate, type ProviderJobs, type ServiceRequest } from '@dimol/shared';
import { acceptJob, getMarketRate, listJobs } from '../api/client';
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

export function DemolitionHomeScreen() {
  const nav = useNavigation();
  const user = useSession();
  const config = ROLE_CONFIG.DEMOLITION_COMPANY;

  const [jobs, setJobs] = useState<ProviderJobs | null>(null);
  const [rate, setRate] = useState<MarketRate | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [quoteAmounts, setQuoteAmounts] = useState<Record<string, string>>({});
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
        <FadeInUp delay={40}>
          <View style={styles.bannerContainer}>
            <View style={styles.bannerLeft}>
              <Text style={styles.bannerTitle}>철거 후 처리도 완벽하게</Text>
              <Text style={styles.bannerSubtitle}>디몰링크 파트너스</Text>
            </View>
            <Text style={{fontSize: 70, position: 'absolute', right: 20, bottom: 20}}>🤝</Text>
          </View>
        </FadeInUp>
        
        <View style={styles.gridContainer}>
          <View style={styles.gridLeft}>
            <FadeInUp delay={100}>
              <Pressable
                style={styles.cardLarge}
                onPress={() => nav.push({ name: 'requestForm', kind: 'TRANSPORT' })}
              >
                <Text style={styles.cardLargeTitle}>운반 차량{'\n'}부르기</Text>
                <Text style={{fontSize: 72, textAlign: 'center', marginTop: 20}}>🚚</Text>
              </Pressable>
            </FadeInUp>
          </View>

          <View style={styles.gridRight}>
            <FadeInUp delay={160}>
              <Pressable
                style={styles.cardSmall}
                onPress={() => nav.push({ name: 'siteAnalysis' })}
              >
                <View style={styles.cardSmallContent}>
                  <Text style={styles.cardSmallTitle}>현장 사진{'\n'}분석</Text>
                  <Text style={{fontSize: 40}}>📷</Text>
                </View>
              </Pressable>
            </FadeInUp>
            <FadeInUp delay={220}>
              <Pressable
                style={styles.cardSmall}
                onPress={() => nav.push({ name: 'estimate' })}
              >
                <View style={styles.cardSmallContent}>
                  <Text style={styles.cardSmallTitle}>폐기물 양{'\n'}계산</Text>
                  <Text style={{fontSize: 40}}>📐</Text>
                </View>
              </Pressable>
            </FadeInUp>
          </View>
        </View>

        <FadeInUp delay={260}>
          <Pressable
            style={styles.interiorCard}
            onPress={() => nav.push({ name: 'requestForm', kind: 'DISPOSAL_RESERVATION' })}
          >
            <Text style={styles.interiorEmoji}>♻️</Text>
            <View style={styles.interiorTextBox}>
              <Text style={styles.interiorTitle}>처리장 예약하기</Text>
              <Text style={styles.interiorSubtitle}>폐기물 반입 일정을 미리 잡아요</Text>
            </View>
            <Text style={styles.interiorChevron}>›</Text>
          </Pressable>
        </FadeInUp>

        {renderMarketRate()}

        <SectionTitle>새 철거 요청</SectionTitle>
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
                label="수주하기"
                onPress={() => accept(job.id)}
                loading={acceptingId === job.id}
              />
            </Card>
          ))
        ) : (
          <Text style={styles.emptyText}>지금 들어온 철거 요청이 없어요.</Text>
        )}

        <SectionTitle>수주한 철거</SectionTitle>
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
          <Text style={styles.emptyText}>수주한 철거가 없어요.</Text>
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
  gridContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  gridLeft: {
    flex: 1.1,
    marginRight: spacing.xs,
  },
  gridRight: {
    flex: 1,
  },
  cardLarge: {
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: spacing.sm,
    height: 240,
    justifyContent: 'space-between',
    shadowColor: '#0B1B3A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardLargeTitle: {
    fontSize: font.title,
    fontWeight: '800',
    color: colors.text,
    lineHeight: font.title + 4,
  },
  cardSmall: {
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: spacing.sm,
    height: 116,
    marginBottom: spacing.xs,
    justifyContent: 'space-between',
    position: 'relative',
    shadowColor: '#0B1B3A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardSmallContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardSmallTitle: {
    fontSize: font.bodyLarge - 2,
    fontWeight: '800',
    color: colors.text,
    lineHeight: font.bodyLarge + 2,
    flex: 1,
  },
  interiorCard: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 20,
    flexDirection: 'row',
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    padding: spacing.md,
  },
  interiorEmoji: {
    fontSize: font.titleLarge,
    marginRight: spacing.sm,
  },
  interiorTextBox: {
    flex: 1,
  },
  interiorTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  interiorSubtitle: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: 2,
  },
  interiorChevron: {
    color: colors.primary,
    fontSize: font.titleLarge,
    fontWeight: '800',
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
