import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  type MarketRate,
  type ServiceRequest,
} from '@dimol/shared';
import { getMarketRate, listRequests, listUsers } from '../api/client';
import { FEATURE_INTERIOR } from '../featureFlags';
import { AppIcon } from '../components/AppIcon';
import { Card, SectionTitle, StatusBadge } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { UserGuideModal } from '../components/UserGuideModal';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { hasSeenGuide, setSeenGuide } from '../lib/session-storage';
import { theme } from '../theme';

const MARKET_RATE_MIN_SAMPLE = 5;

const RATE_TITLE = {
  TRANSPORT: '요즘 운반 평균 시세',
  DISPOSAL: '요즘 처리 평균 시세',
} as const;

interface DemolitionPartner {
  id: string;
  name: string;
  region: string;
  rating: number;
  reviewCount: number;
  completedCount: number;
  allbaroCertified: boolean;
  insuranceRegistered: boolean;
  specialties: string[];
}

const DEFAULT_PARTNERS: DemolitionPartner[] = [
  {
    id: 'partner-1',
    name: '대한철거산업',
    region: '서울 · 경기 전지역',
    rating: 4.9,
    reviewCount: 52,
    completedCount: 168,
    allbaroCertified: true,
    insuranceRegistered: true,
    specialties: ['상가 · 사무실 원상복구', '완파 철거', '폐기물 일괄'],
  },
  {
    id: 'partner-2',
    name: '태양철거엔지니어링',
    region: '수도권 · 양평 · 경기동부',
    rating: 4.8,
    reviewCount: 38,
    completedCount: 124,
    allbaroCertified: true,
    insuranceRegistered: true,
    specialties: ['인테리어 내부 철거', '구조물 해체', '안심 에스크로'],
  },
  {
    id: 'partner-3',
    name: '바른원상복구',
    region: '서울 전역 · 하남 · 남양주',
    rating: 4.9,
    reviewCount: 64,
    completedCount: 195,
    allbaroCertified: true,
    insuranceRegistered: true,
    specialties: ['프랜차이즈 퇴거 원복', '야간 시공 가능', '올바로 연동'],
  },
  {
    id: 'partner-4',
    name: '삼우환경철거',
    region: '경기 전지역 · 인천',
    rating: 4.7,
    reviewCount: 29,
    completedCount: 98,
    allbaroCertified: true,
    insuranceRegistered: true,
    specialties: ['공장 · 창고 철거', '건설폐기물 수집운반', '정밀 실사'],
  },
];

export function ConsumerHomeScreen() {
  const nav = useNavigation();
  const user = useSession();
  const config = ROLE_CONFIG.CONSUMER;

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [partners, setPartners] = useState<DemolitionPartner[]>(DEFAULT_PARTNERS);
  const [rate, setRate] = useState<MarketRate | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const seen = await hasSeenGuide(user.id);
      if (!seen && active) {
        setShowGuide(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [user.id]);

  const load = useCallback(async () => {
    const [reqsRes, rateRes, usersRes] = await Promise.allSettled([
      listRequests(user.id),
      config.marketRateParty ? getMarketRate(config.marketRateParty) : Promise.resolve(null),
      listUsers({ userType: 'DEMOLITION_COMPANY', approvalStatus: 'APPROVED' }),
    ]);
    if (reqsRes.status === 'fulfilled') setRequests(reqsRes.value);
    if (rateRes.status === 'fulfilled' && rateRes.value) setRate(rateRes.value);
    if (usersRes.status === 'fulfilled' && usersRes.value && usersRes.value.length > 0) {
      const apiPartners: DemolitionPartner[] = usersRes.value.map((u, i) => ({
        id: u.id,
        name: u.name,
        region: u.region ? `${u.region} 및 인근 전지역` : '수도권 전지역',
        rating: 4.8 + ((i * 3) % 3) * 0.1,
        reviewCount: 25 + i * 14,
        completedCount: 80 + i * 35,
        allbaroCertified: u.allbaroCertified ?? true,
        insuranceRegistered: u.insuranceRegistered ?? true,
        specialties: i % 2 === 0 ? ['상가·사무실 원상복구', '완파 철거'] : ['인테리어 내부 철거', '폐기물 일괄'],
      }));
      const existingNames = new Set(apiPartners.map((p) => p.name));
      const merged = [
        ...apiPartners,
        ...DEFAULT_PARTNERS.filter((p) => !existingNames.has(p.name)),
      ];
      setPartners(merged);
    }
  }, [user.id, config.marketRateParty]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const renderActiveRequests = () => {
    const active = requests.filter((r) => r.status !== 'COMPLETED' && r.status !== 'SETTLED');
    if (active.length === 0) return null;

    return (
      <View>
        <SectionTitle>진행 중인 내 요청</SectionTitle>
        {active.map((req) => (
          <Card key={req.id} onPress={() => nav.push({ name: 'requestDetail', requestId: req.id })}>
            <View style={styles.requestRow}>
              <Text style={styles.requestTitle}>{REQUEST_KIND_LABELS[req.kind]}</Text>
              <StatusBadge status={req.status} label={REQUEST_STATUS_LABELS[req.status]} />
            </View>
            <Text style={styles.requestMeta}>
              {req.wasteTons}톤 · {new Date(req.createdAt).toLocaleDateString('ko-KR')}
            </Text>
          </Card>
        ))}
      </View>
    );
  };

  const renderMarketRate = () => {
    if (
      config.marketRateParty &&
      rate &&
      rate.quoteCount >= MARKET_RATE_MIN_SAMPLE &&
      rate.averageAmount !== null
    ) {
      return (
        <Card style={styles.rateCard}>
          <Text style={styles.rateTitle}>{RATE_TITLE[config.marketRateParty]}</Text>
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
              <Text style={styles.bannerTitle}>철거를 더 쉽고, 더 똑똑하게</Text>
              <Text style={styles.bannerSubtitle}>새롭게 비우는 공식, 비움</Text>
            </View>
            <View style={{ position: 'absolute', right: 20, bottom: 20 }}>
              <AppIcon name="building" size={48} color="#FFFFFF" />
            </View>
          </View>
        </FadeInUp>

        <FadeInUp delay={100}>
          <Pressable
            style={styles.cardBox}
            onPress={() => nav.push({ name: 'requestForm', kind: 'DEMOLITION' })}
          >
            <Text style={styles.cardBoxTitle}>철거 · 원상복구{'\n'}신청하기</Text>
            <View style={styles.cardBoxIconWrap}>
              <AppIcon name="hammer" size={56} color={theme.colors.primary} />
            </View>
          </Pressable>
        </FadeInUp>

        {/* 입점해있는 협력 철거업체 목록 */}
        <FadeInUp delay={160}>
          <View style={styles.partnerSection}>
            <View style={styles.partnerSectionHeader}>
              <View>
                <Text style={styles.partnerSectionTitle}>비움 협력 철거업체</Text>
                <Text style={styles.partnerSectionSubtitle}>
                  올바로 인계서 연동 및 사업자 검증을 완료한 파트너스
                </Text>
              </View>
              <View style={styles.partnerBadge}>
                <Text style={styles.partnerBadgeText}>100% 검증</Text>
              </View>
            </View>

            {partners.map((partner) => (
              <Pressable
                key={partner.id}
                style={styles.partnerCard}
                onPress={() => nav.push({ name: 'requestForm', kind: 'DEMOLITION' })}
              >
                <View style={styles.partnerTopRow}>
                  <View style={styles.partnerLogoWrap}>
                    <AppIcon name="hammer" size={20} color={theme.colors.primary} />
                  </View>
                  <View style={styles.partnerMainInfo}>
                    <View style={styles.partnerNameRow}>
                      <Text style={styles.partnerName}>{partner.name}</Text>
                      <View style={styles.certifiedChip}>
                        <AppIcon name="check" size={11} color={theme.colors.primary} />
                        <Text style={styles.certifiedChipText}>인증</Text>
                      </View>
                    </View>
                    <Text style={styles.partnerRegion}>
                      📍 {partner.region} · 시공 {partner.completedCount}건
                    </Text>
                  </View>
                  <View style={styles.partnerRatingBox}>
                    <Text style={styles.partnerRatingStar}>★</Text>
                    <Text style={styles.partnerRatingScore}>{partner.rating.toFixed(1)}</Text>
                    <Text style={styles.partnerReviewCount}>({partner.reviewCount})</Text>
                  </View>
                </View>

                <View style={styles.partnerTagsRow}>
                  {partner.specialties.map((spec, idx) => (
                    <View key={idx} style={styles.partnerTag}>
                      <Text style={styles.partnerTagText}>{spec}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.partnerFooterRow}>
                  <View style={styles.partnerVerification}>
                    {partner.allbaroCertified && (
                      <Text style={styles.verifyItem}>✓ 올바로 인증</Text>
                    )}
                    {partner.insuranceRegistered && (
                      <Text style={styles.verifyItem}>✓ 배상책임보험</Text>
                    )}
                  </View>
                  <Text style={styles.partnerCtaText}>견적 신청 ➔</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </FadeInUp>

        {/* 인테리어(밀봉 역경매)는 파일럿 밖 — FEATURE_INTERIOR 가 켜졌을 때만 노출한다. */}
        {FEATURE_INTERIOR ? (
          <FadeInUp delay={260}>
            <Pressable
              style={styles.interiorCard}
              onPress={() => nav.push({ name: 'interiorForm' })}
            >
              <View style={{ marginRight: 12 }}>
                <AppIcon name="tools" size={26} color={theme.colors.primary} />
              </View>
              <View style={styles.interiorTextBox}>
                <Text style={styles.interiorTitle}>인테리어 시공 역경매 견적</Text>
                <Text style={styles.interiorSubtitle} numberOfLines={2}>
                  여러 전문 검증 업체 비밀 견적 비교 후 선택하세요
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
        ) : null}

        <View style={styles.contentPadding}>
          {renderActiveRequests()}
          {renderMarketRate()}
        </View>
      </ScrollView>
      <TabBar active="home" />

      <UserGuideModal
        visible={showGuide}
        onClose={() => setShowGuide(false)}
        onNeverShowAgain={async () => {
          await setSeenGuide(user.id);
          setShowGuide(false);
        }}
        isNewUser={requests.length === 0}
      />
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
  contentPadding: {
    paddingHorizontal: 0,
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
    color: '#FFFFFF',
    fontSize: font.title,
    fontWeight: '800',
    marginTop: 4,
  },
  bannerImage: {
    width: 76,
    height: 76,
    position: 'absolute',
    right: 16,
    top: 22,
    zIndex: 1,
  },
  cardBox: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1.5,
    height: 200,
    justifyContent: 'space-between',
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
    shadowColor: '#0B1B3A',
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
  cardBoxIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  interiorCard: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: '#C5D6FA',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    padding: spacing.md,
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
  emptyCard: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 20,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  emptyCardText: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  partnerSection: {
    marginHorizontal: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  partnerSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  partnerSectionTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
  },
  partnerSectionSubtitle: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: 2,
  },
  partnerBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  partnerBadgeText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  partnerCard: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: '#0B1B3A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  partnerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  partnerLogoWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  partnerMainInfo: {
    flex: 1,
  },
  partnerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  partnerName: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  certifiedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    gap: 2,
  },
  certifiedChipText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  partnerRegion: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: 2,
  },
  partnerRatingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
  },
  partnerRatingStar: {
    color: '#F59E0B',
    fontSize: font.caption,
    fontWeight: '800',
  },
  partnerRatingScore: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '800',
  },
  partnerReviewCount: {
    color: colors.textMuted,
    fontSize: font.caption,
  },
  partnerTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: spacing.xs,
  },
  partnerTag: {
    backgroundColor: colors.surface,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  partnerTagText: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '600',
  },
  partnerFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: spacing.xs,
    paddingTop: 8,
  },
  partnerVerification: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verifyItem: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '600',
  },
  partnerCtaText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '800',
  },
});

