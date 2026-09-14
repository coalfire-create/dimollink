import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ASBESTOS_RISK_LABELS,
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  asbestosRisk,
  resolveFloorArea,
  type MarketRate,
  type ProviderJobs,
  type RankedJob,
  type ServiceRequest,
} from '@dimol/shared';
import { getMarketRate, listJobs } from '../api/client';
import { AppIcon } from '../components/AppIcon';
import { Card, SectionTitle, StatusBadge,
  InlineEmpty,
} from '../components/ui';
import { FadeInUp, PressableScale } from '../components/motion';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { theme } from '../theme';

const MARKET_RATE_MIN_SAMPLE = 5;

/**
 * 새 철거 요청 카드 — 견적을 낼지 말지 **목록에서 바로 판단할 수 있게** 하는 요약.
 *
 * 거리·톤수만 보고는 들어갈 만한 일인지 알 수 없다. 금액을 크게 흔드는 세 가지
 * (연면적 · 석면 · 사진 유무)를 카드에 미리 얹어, 열어 볼 요청을 고르게 한다.
 */
function OpenJobCard({ job, onPress }: { job: RankedJob; onPress: () => void }) {
  const details = job.kind === 'DEMOLITION' ? job.demolitionDetails : undefined;
  const area = resolveFloorArea(details);
  const risk = asbestosRisk(details?.buildingLedger);
  const riskIsReal = risk === 'HIGH' || risk === 'POSSIBLE';

  return (
    <Card onPress={onPress}>
      <View style={styles.requestRow}>
        <Text style={styles.requestTitle}>{REQUEST_KIND_LABELS[job.kind]}</Text>
        {job.distanceKm != null ? (
          <Text style={styles.distance}>{job.distanceKm}km</Text>
        ) : null}
      </View>
      <Text style={styles.requestMeta}>{requestSubtitle(job)}</Text>

      <View style={styles.signalRow}>
        {area ? (
          <View style={styles.signal}>
            <Text style={styles.signalText}>연면적 {area.m2.toLocaleString('ko-KR')}㎡</Text>
          </View>
        ) : null}
        <View style={styles.signal}>
          <Text style={styles.signalText}>{job.wasteTons}톤</Text>
        </View>
        <View style={styles.signal}>
          <Text style={styles.signalText}>
            사진 {job.sitePhotoKeys.length}장
          </Text>
        </View>
        {riskIsReal ? (
          <View style={[styles.signal, styles.signalWarn]}>
            <Text style={[styles.signalText, styles.signalWarnText]}>
              {ASBESTOS_RISK_LABELS[risk]}
            </Text>
          </View>
        ) : null}
      </View>

      {/* CTA 를 왼쪽에 둔다 — 오른쪽 아래는 고객센터 플로팅 버튼이 지나가는 자리라
          거기에 두면 목록을 스크롤할 때 버튼에 가린다. */}
      <View style={styles.jobFooter}>
        <Text style={styles.jobCta}>견적 산정하기</Text>
        <Text style={styles.jobDate}>
          {new Date(job.createdAt).toLocaleDateString('ko-KR')} 접수
        </Text>
      </View>
    </Card>
  );
}

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
              <Text style={styles.bannerSubtitle}>비움 파트너스</Text>
            </View>
            <View style={{ position: 'absolute', right: 20, bottom: 20 }}>
              <AppIcon name="building" size={48} color={colors.background} />
            </View>
          </View>
        </FadeInUp>

        <FadeInUp delay={100}>
          <PressableScale
            accessibilityLabel="운반 차량 부르기"
            accessibilityHint="상·하차 주소와 폐기물을 입력해 운반을 요청합니다"
            style={styles.cardBox}
            onPress={() => nav.push({ name: 'requestForm', kind: 'TRANSPORT' })}
          >
            <View style={styles.cardBoxText}>
              <Text style={styles.cardBoxTitle}>운반 차량{'\n'}부르기</Text>
              <Text style={styles.cardBoxSubtitle}>철거 후 반출까지 이어서 맡겨요</Text>
            </View>
            <View style={styles.cardBoxIconWrap}>
              <AppIcon name="truck" size={40} color={theme.colors.primary} />
            </View>
          </PressableScale>
        </FadeInUp>

        <FadeInUp delay={260}>
          <Pressable
            style={styles.interiorCard}
            onPress={() => nav.push({ name: 'requestForm', kind: 'DISPOSAL_RESERVATION' })}
          >
            <AppIcon name="recycle" size={26} color={theme.colors.primary} />
            <View style={styles.interiorTextBox}>
              <Text style={styles.interiorTitle}>처리장 예약하기</Text>
              <Text style={styles.interiorSubtitle}>폐기물 반입 일정을 미리 잡아요</Text>
            </View>
            <Text style={styles.interiorChevron}>›</Text>
          </Pressable>
        </FadeInUp>

        {renderMarketRate()}

        {/* 선착순 수주를 없앴다. 철거 금액은 현장을 봐야 정해지는데, 사진만 보고
            던진 금액을 계약금액으로 굳히면 실사 후 추가금 분쟁이 된다.
            개산(범위) → 실사 → 확정 순서로 간다([[demolition-estimate]]).
            금액 입력은 카드 안이 아니라 견적 산정 화면에서 받는다 — 여기 세 칸만 있으면
            사진·대장·진입 조건을 하나도 못 보고 금액을 부르게 된다. */}
        <SectionTitle>새 철거 요청</SectionTitle>
        {jobs && jobs.open.length > 0 ? (
          jobs.open.map((job) => (
            <OpenJobCard
              key={job.id}
              job={job}
              onPress={() => nav.push({ name: 'estimateWorksheet', requestId: job.id })}
            />
          ))
        ) : (
          <InlineEmpty>지금 들어온 철거 요청이 없어요.</InlineEmpty>
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
          <InlineEmpty>수주한 철거가 없어요.</InlineEmpty>
        )}
      </ScrollView>
      <TabBar active="home" />
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  signalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  signal: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.badge,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs / 2,
  },
  signalWarn: {
    backgroundColor: theme.colors.warningSoft,
  },
  signalText: {
    color: theme.colors.textMuted,
    fontSize: theme.font.caption,
    fontWeight: '700',
  },
  signalWarnText: {
    color: theme.colors.warning,
  },
  jobFooter: {
    alignItems: 'center',
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  jobDate: {
    color: theme.colors.textMuted,
    fontSize: theme.font.caption,
  },
  jobCta: {
    color: theme.colors.primary,
    fontSize: theme.font.body,
    fontWeight: '800',
  },
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
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
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
  cardBox: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1.5,
    // 높이를 200 으로 고정해 두면 내용이 위아래로 벌어져 가운데가 텅 빈다.
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardBoxTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    lineHeight: font.title + 6,
  },
  cardBoxText: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  cardBoxSubtitle: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs,
  },
  cardBoxIconWrap: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: theme.radius.badge,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  interiorCard: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
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
    marginTop: spacing.xs / 2,
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
});
