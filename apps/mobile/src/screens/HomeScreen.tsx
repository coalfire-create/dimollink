import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { FadeInUp } from '../components/motion';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { theme } from '../theme';

import homeWasteBed from '../../assets/home_waste_bed.png';
import homeHelmet from '../../assets/home_helmet.png';
import homeRecycleBag from '../../assets/home_recycle_bag.png';
import homeSmartPhone from '../../assets/home_smart_phone.png';
import homeUsedSofa from '../../assets/home_used_sofa.png';
import homeUsedDesk from '../../assets/home_used_desk.png';

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

  if (user.userType === 'CONSUMER') {
    return (
      <View style={styles.screen}>
        {/* Custom Header (001.png 기반) */}
        <View style={styles.customHeader}>
          <Pressable style={styles.addressSelector}>
            <Text style={styles.addressText}>주소지 등록이 필요해요</Text>
            <Text style={styles.addressArrow}>▼</Text>
          </Pressable>
          <Pressable style={styles.notiButton}>
            <Text style={styles.notiIcon}>🔔</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.consumerContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          {/* 배너: 안쓰는 스마트폰 있으신가요? */}
          <FadeInUp delay={40}>
            <View style={styles.bannerContainer}>
              <View style={styles.bannerLeft}>
                <Text style={styles.bannerTitle}>안쓰는 스마트폰 있으신가요?</Text>
                <Text style={styles.bannerSubtitle}>내 폰 시세보고 용돈벌기</Text>
              </View>
              <Image source={homeSmartPhone} style={styles.bannerImage} resizeMode="contain" />
              <View style={styles.bannerIndicator}>
                <Text style={styles.bannerIndicatorText}>2 / 4</Text>
              </View>
            </View>
          </FadeInUp>

          {/* 핵심 서비스 섹션: 새롭게 버리는 공식, 빼기 */}
          <Text style={styles.sectionTitleText}>새롭게 버리는 공식, 빼기</Text>
          
          <View style={styles.gridContainer}>
            {/* 왼쪽 카드 (대형폐기물 버리기) */}
            <View style={styles.gridLeft}>
              <FadeInUp delay={100}>
                <Pressable 
                  style={styles.cardLarge}
                  onPress={() => nav.push({ name: 'requestForm', kind: 'DEMOLITION' })}
                >
                  <Text style={styles.cardLargeTitle}>대형폐기물{"\n"}버리기</Text>
                  <Image source={homeWasteBed} style={styles.cardLargeImage} resizeMode="contain" />
                </Pressable>
              </FadeInUp>
            </View>

            {/* 오른쪽 카드 2개 */}
            <View style={styles.gridRight}>
              {/* 철거/원상복구 신청 */}
              <FadeInUp delay={160}>
                <Pressable 
                  style={styles.cardSmall}
                  onPress={() => nav.push({ name: 'requestForm', kind: 'DEMOLITION' })}
                >
                  <View style={styles.badgeReturn}>
                    <Text style={styles.badgeReturnText}>희망리턴패키지 지원!</Text>
                  </View>
                  <View style={styles.cardSmallContent}>
                    <Text style={styles.cardSmallTitle}>철거 · 원상복구{"\n"}신청하기</Text>
                    <Image source={homeHelmet} style={styles.cardSmallImage} resizeMode="contain" />
                  </View>
                </Pressable>
              </FadeInUp>

              {/* 팔아보고 주워보고 */}
              <FadeInUp delay={220}>
                <Pressable 
                  style={styles.cardSmall}
                  onPress={() => nav.push({ name: 'siteAnalysis' })}
                >
                  <View style={styles.cardSmallContent}>
                    <Text style={styles.cardSmallTitle}>팔아보고{"\n"}주워보고</Text>
                    <Image source={homeRecycleBag} style={styles.cardSmallImage} resizeMode="contain" />
                  </View>
                </Pressable>
              </FadeInUp>
            </View>
          </View>

          {/* 인테리어 시공 견적받기 (밀봉 역경매) */}
          <FadeInUp delay={260}>
            <Pressable
              style={styles.interiorCard}
              onPress={() => nav.push({ name: 'interiorForm' })}
            >
              <Text style={styles.interiorEmoji}>🛠️</Text>
              <View style={styles.interiorTextBox}>
                <Text style={styles.interiorTitle}>인테리어 시공 견적받기</Text>
                <Text style={styles.interiorSubtitle}>
                  여러 업체가 비밀 견적 · 나만 비교하고 골라요
                </Text>
              </View>
              <Text style={styles.interiorChevron}>›</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.interiorMyLink}
              onPress={() => nav.push({ name: 'interiorList', scope: 'mine' })}
            >
              <Text style={styles.interiorMyLinkText}>내 인테리어 요청 보기 ›</Text>
            </Pressable>
          </FadeInUp>

          {/* 이런 서비스도 있어요 */}
          <View style={styles.extraServicesContainer}>
            <Text style={styles.extraServicesHeader}>이런 서비스도 있어요</Text>
            <View style={styles.extraServicesGrid}>
              <Pressable style={styles.extraServiceItem} onPress={() => nav.push({ name: 'requestForm', kind: 'DEMOLITION' })}>
                <View style={styles.extraIconWrap}>
                  <Text style={styles.extraIcon}>🚨</Text>
                </View>
                <Text style={styles.extraLabel}>공사장 폐기물{"\n"}배출신고</Text>
              </Pressable>

              <Pressable style={styles.extraServiceItem} onPress={() => nav.push({ name: 'requestForm', kind: 'DEMOLITION' })}>
                <View style={styles.extraIconWrap}>
                  <Text style={styles.extraIcon}>🎁</Text>
                  <View style={styles.eventBadge}><Text style={styles.eventBadgeText}>이벤트</Text></View>
                </View>
                <Text style={styles.extraLabel}>의류·잡화{"\n"}기부하기</Text>
              </Pressable>

              <Pressable style={styles.extraServiceItem} onPress={() => nav.push({ name: 'siteAnalysis' })}>
                <View style={styles.extraIconWrap}>
                  <Text style={styles.extraIcon}>📱</Text>
                  <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>
                </View>
                <Text style={styles.extraLabel}>내 폰 시세보고{"\n"}용돈벌기</Text>
              </Pressable>
            </View>
          </View>

          {/* 판매 중인 중고상품 */}
          <View style={styles.usedGoodsHeader}>
            <Text style={styles.usedGoodsTitle}>판매 중인 중고상품</Text>
            <Pressable onPress={() => nav.push({ name: 'siteAnalysis' })}>
              <Text style={styles.usedGoodsMore}>구경하기 ›</Text>
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.usedGoodsScroll}>
            {/* 상품 1 */}
            <View style={styles.goodsCard}>
              <Image source={homeUsedSofa} style={styles.goodsImage} />
              <Pressable style={styles.likeButton}>
                <Text style={styles.likeIcon}>🤍</Text>
              </Pressable>
              <Text style={styles.goodsTitle} numberOfLines={1}>가죽 소파 (상태 최상)</Text>
              <Text style={styles.goodsPrice}>120,000원</Text>
            </View>

            {/* 상품 2 */}
            <View style={styles.goodsCard}>
              <Image source={homeUsedDesk} style={styles.goodsImage} />
              <Pressable style={styles.likeButton}>
                <Text style={styles.likeIcon}>🤍</Text>
              </Pressable>
              <Text style={styles.goodsTitle} numberOfLines={1}>원목 책상 + 의자 세트</Text>
              <Text style={styles.goodsPrice}>85,000원</Text>
            </View>
          </ScrollView>

        </ScrollView>
        <TabBar active="home" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={`${user.name}${config.homeGreetingSuffix}`} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {config.showAvailability ? (
          <FadeInUp delay={40}>
            <Card style={[styles.availCard, online && styles.availCardOn]}>
              <Text style={styles.availStatus}>
                {online ? '🟢 ' : '⚪ '}
                {CALL_AVAILABILITY_LABELS[availability]}
              </Text>
              <Text style={styles.availDescription}>
                {online ? '콜을 받는 중이에요' : '켜면 운반 콜을 받아요'}
              </Text>
              <AppButton
                label={online ? '콜대기 끄기' : '콜대기 켜기'}
                variant={online ? 'outline' : 'primary'}
                onPress={toggleAvailability}
                loading={availBusy}
              />
            </Card>
          </FadeInUp>
        ) : null}

        {config.homeActions.length > 0 ? (
          <>
            {config.homeIntro ? <SectionTitle>{config.homeIntro}</SectionTitle> : null}
            {config.homeActions.map((action, i) => (
              <FadeInUp key={action.key} delay={80 + i * 70}>
                <Card onPress={() => nav.push(action.route)}>
                  <View style={styles.actionRow}>
                    <Text style={styles.actionIcon}>{action.icon}</Text>
                    <View style={styles.actionTextBox}>
                      <Text style={styles.actionTitle}>{action.title}</Text>
                      <Text style={styles.actionDescription}>{action.description}</Text>
                    </View>
                    <Text style={styles.actionChevron}>›</Text>
                  </View>
                </Card>
              </FadeInUp>
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
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  addressSelector: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressText: {
    fontSize: font.bodyLarge,
    fontWeight: '700',
    color: colors.text,
    marginRight: 4,
  },
  addressArrow: {
    fontSize: font.caption,
    color: colors.textMuted,
  },
  notiButton: {
    padding: 6,
  },
  notiIcon: {
    fontSize: font.title,
  },
  consumerContent: {
    paddingBottom: spacing.lg,
    backgroundColor: '#F6F7F9',
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
  bannerImage: {
    width: 90,
    height: 90,
    position: 'absolute',
    right: 12,
    bottom: 6,
    zIndex: 1,
  },
  bannerIndicator: {
    position: 'absolute',
    right: 16,
    top: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  bannerIndicatorText: {
    color: '#FFFFFF',
    fontSize: font.caption - 4,
    fontWeight: '700',
  },
  sectionTitleText: {
    fontSize: font.title,
    fontWeight: '800',
    color: colors.text,
    marginLeft: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
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
  cardLargeImage: {
    width: '100%',
    height: 120,
    alignSelf: 'center',
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
  badgeReturn: {
    position: 'absolute',
    top: -8,
    left: spacing.sm,
    backgroundColor: '#3CD18A',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 3,
  },
  badgeReturnText: {
    color: '#FFFFFF',
    fontSize: font.caption - 6,
    fontWeight: '800',
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
  cardSmallImage: {
    width: 54,
    height: 54,
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
  interiorMyLink: {
    alignSelf: 'flex-end',
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  interiorMyLinkText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  extraServicesContainer: {
    backgroundColor: colors.background,
    marginHorizontal: spacing.sm,
    borderRadius: 20,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    shadowColor: '#0B1B3A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  extraServicesHeader: {
    fontSize: font.bodyLarge,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  extraServicesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  extraServiceItem: {
    flex: 1,
    alignItems: 'center',
  },
  extraIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F6F7F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  extraIcon: {
    fontSize: font.titleLarge,
  },
  eventBadge: {
    position: 'absolute',
    top: -6,
    backgroundColor: colors.secondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  eventBadgeText: {
    color: '#FFFFFF',
    fontSize: font.caption - 8,
    fontWeight: '800',
  },
  newBadge: {
    position: 'absolute',
    top: -6,
    backgroundColor: '#005EFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  newBadgeText: {
    color: '#FFFFFF',
    fontSize: font.caption - 8,
    fontWeight: '800',
  },
  extraLabel: {
    fontSize: font.caption - 2,
    color: colors.text,
    textAlign: 'center',
    lineHeight: font.caption + 2,
    fontWeight: '600',
  },
  usedGoodsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  usedGoodsTitle: {
    fontSize: font.title,
    fontWeight: '800',
    color: colors.text,
  },
  usedGoodsMore: {
    fontSize: font.body,
    fontWeight: '700',
    color: colors.primary,
  },
  usedGoodsScroll: {
    paddingLeft: spacing.sm,
    marginBottom: spacing.md,
  },
  goodsCard: {
    width: 160,
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 8,
    marginRight: spacing.xs,
    position: 'relative',
    shadowColor: '#0B1B3A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  goodsImage: {
    width: '100%',
    height: 110,
    borderRadius: 12,
    backgroundColor: '#F6F7F9',
  },
  likeButton: {
    position: 'absolute',
    right: 16,
    bottom: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  likeIcon: {
    fontSize: font.caption - 4,
    color: colors.textMuted,
  },
  goodsTitle: {
    fontSize: font.caption - 1,
    fontWeight: '700',
    color: colors.text,
    marginTop: 8,
  },
  goodsPrice: {
    fontSize: font.body,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  availCard: {
    borderColor: colors.border,
  },
  availCardOn: {
    backgroundColor: '#E7EFFC',
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
