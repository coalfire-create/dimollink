import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  imageUrl?: string;
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
    imageUrl: 'https://images.unsplash.com/photo-1541888086925-ebc66113b2e9?w=200&q=80',
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
    imageUrl: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=200&q=80',
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
    imageUrl: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=200&q=80',
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
    imageUrl: 'https://images.unsplash.com/photo-1531834685032-c34bf0d84c77?w=200&q=80',
  },
];


interface CustomerReview {
  id: string;
  author: string;
  location: string;
  serviceType: string;
  partnerName: string;
  rating: number;
  date: string;
  content: string;
  tags: string[];
}

const CUSTOMER_REVIEWS: CustomerReview[] = [
  {
    id: "rev-1",
    author: "김*우 사장님",
    location: "서울 마포구 상가 (45평)",
    serviceType: "프랜차이즈 퇴거 원상복구",
    partnerName: "바른원상복구",
    rating: 5,
    date: "2026.09.08",
    content: "프랜차이즈 퇴거라 건물주 원상복구 기준이 엄청 까다로워서 걱정 많았는데, 소장님이 건물주랑 직접 소통하며 기준 맞춰주셔서 보증금 1원도 안 깎이고 전액 돌려받았습니다. 올바로 인계서도 당일 바로 발급되어 폐업 신고까지 완벽히 끝났습니다.",
    tags: ["보증금 100% 반환", "올바로 인계서 당일 발급", "소통 원활"],
  },
  {
    id: "rev-2",
    author: "박*서 원장님",
    location: "경기 수원 영통구 (60평)",
    serviceType: "학원 내부 완파 철거",
    partnerName: "대한철거산업",
    rating: 5,
    date: "2026.09.02",
    content: "학원 밀집 건물이라 소음 민원 들어올까 봐 밤잠을 설쳤는데, 현수막 설치부터 꼼꼼한 방음 보양 작업까지 챙겨주셔서 주말 동안 민원 0건으로 끝났습니다. 폐기물 처리 과정까지 비움에서 투명하게 확인되니 너무 안심되더라고요.",
    tags: ["민원 0건", "안전 시공", "추가금 없음"],
  },
  {
    id: "rev-3",
    author: "이*진 대표님",
    location: "서울 강남구 테헤란로 (32평)",
    serviceType: "사무실 칸막이 및 바닥 원복",
    partnerName: "태양철거엔지니어링",
    rating: 5,
    date: "2026.08.27",
    content: "개인적으로 알아봤을 땐 현장에서 추가금 요구할까 봐 불안했는데, 정찰제로 명확하고 추가 비용 없이 바닥 디럭스타일까지 완벽 복구해주셨습니다. 일정이 빠듯했는데 약속한 날짜에 딱 맞춰주셔서 감동했습니다.",
    tags: ["추가금 일절 없음", "일정 준수", "정밀 원상복구"],
  },
  {
    id: "rev-4",
    author: "최*영 점주님",
    location: "경기 하남 미사강변 (18평)",
    serviceType: "카페 주방 설비 및 부분 철거",
    partnerName: "삼우환경철거",
    rating: 5,
    date: "2026.08.19",
    content: "주방 설비 반출이랑 바닥 타일 철거만 부분적으로 필요했는데, 딱 필요한 부분만 합리적으로 견적 내주셨어요. 통행로에 먼지 안 날리게 보양 작업도 완벽했고 다음 세입자 인테리어 팀에서도 정말 깔끔하다고 칭찬했습니다.",
    tags: ["합리적 견적", "완벽 보양", "깔끔한 마감"],
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
        imageUrl: (u as any).imageUrl,
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
              
            </View>

            {partners.map((partner) => (
              <View
                key={partner.id}
                style={styles.partnerCard}
              >
                <View style={styles.partnerTopRow}>
                  <View style={styles.partnerLogoWrap}>
                    {partner.imageUrl ? (
                      <Image source={{ uri: partner.imageUrl }} style={styles.partnerLogoImage} />
                    ) : (
                      <AppIcon name="hammer" size={20} color={theme.colors.primary} />
                    )}
                  </View>
                  <View style={styles.partnerMainInfo}>
                    <View style={styles.partnerNameRow}>
                      <Text style={styles.partnerName}>{partner.name}</Text>
                      
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
                      <Text style={styles.verifyItem}>✓ 올바로 인계서 연동</Text>
                    )}
                    {partner.insuranceRegistered && (
                      <Text style={styles.verifyItem}>✓ 배상책임보험 가입</Text>
                    )}
                  </View>
                  
                </View>
              </View>
            ))}
          </View>
        </FadeInUp>

        {/* 실제 이용 고객 생생 리뷰 섹션 */}
        <FadeInUp delay={200}>
          <View style={styles.reviewSection}>
            <View style={styles.reviewSectionHeader}>
              <View>
                <Text style={styles.reviewSectionTitle}>실제 이용 고객 생생 리뷰</Text>
                <Text style={styles.reviewSectionSubtitle}>
                  비움 협력업체에서 시공을 완료한 고객님들의 100% 솔직 후기
                </Text>
              </View>
              <View style={styles.reviewScoreBadge}>
                <Text style={styles.reviewScoreStar}>★</Text>
                <Text style={styles.reviewScoreText}>4.9 (183개)</Text>
              </View>
            </View>

            {/* 신뢰 지표 배너 */}
            <View style={styles.reviewTrustBanner}>
              <View style={styles.reviewTrustItem}>
                <AppIcon name="shield" size={13} color={theme.colors.primary} />
                <Text style={styles.reviewTrustText}>보증금 반환 99.4%</Text>
              </View>
              <View style={styles.reviewTrustDivider} />
              <View style={styles.reviewTrustItem}>
                <AppIcon name="document" size={13} color={theme.colors.primary} />
                <Text style={styles.reviewTrustText}>올바로 당일 발급 100%</Text>
              </View>
              <View style={styles.reviewTrustDivider} />
              <View style={styles.reviewTrustItem}>
                <AppIcon name="check" size={13} color={theme.colors.primary} />
                <Text style={styles.reviewTrustText}>부당 추가금 0건</Text>
              </View>
            </View>

            {CUSTOMER_REVIEWS.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewCardHeader}>
                  <View style={styles.reviewAuthorRow}>
                    <Text style={styles.reviewAuthor}>{review.author}</Text>
                    <View style={styles.reviewVerifiedBadge}>
                      <AppIcon name="check" size={10} color="#059669" />
                      <Text style={styles.reviewVerifiedText}>실제 시공 인증</Text>
                    </View>
                  </View>
                  <Text style={styles.reviewDate}>{review.date}</Text>
                </View>

                <View style={styles.reviewMetaRow}>
                  <View style={styles.reviewRatingBox}>
                    {Array.from({ length: review.rating }).map((_, i) => (
                      <Text key={i} style={styles.partnerRatingStar}>★</Text>
                    ))}
                  </View>
                  <View style={styles.reviewPartnerChip}>
                    <Text style={styles.reviewPartnerChipText}>{review.partnerName} 시공</Text>
                  </View>
                  <View style={styles.reviewServiceChip}>
                    <Text style={styles.reviewServiceChipText}>{review.serviceType}</Text>
                  </View>
                </View>

                <Text style={styles.reviewLocationText}>📍 {review.location}</Text>
                <Text style={styles.reviewContent}>{review.content}</Text>

                <View style={styles.reviewTagsRow}>
                  {review.tags.map((t, idx) => (
                    <View key={idx} style={styles.reviewTag}>
                      <Text style={styles.reviewTagText}>#{t}</Text>
                    </View>
                  ))}
                </View>
              </View>
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
    backgroundColor: '#F9FAFB',
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
    color: '#111827',
    fontSize: 20,
    fontWeight: '900',
  },
  partnerSectionSubtitle: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: 2,
  },
  
  
  partnerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  partnerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  partnerLogoWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    overflow: 'hidden',
  },
  partnerLogoImage: {
    width: '100%',
    height: '100%',
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
    color: '#111827',
    fontSize: font.title,
    fontWeight: '800',
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
  
  
  reviewSection: {
    marginBottom: spacing.lg,
  },
  reviewSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  reviewSectionTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: "900",
  },
  reviewSectionSubtitle: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: 2,
  },
  reviewScoreBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  reviewScoreStar: {
    color: "#D97706",
    fontSize: font.caption,
    fontWeight: "800",
  },
  reviewScoreText: {
    color: "#92400E",
    fontSize: font.caption,
    fontWeight: "800",
  },
  reviewTrustBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  reviewTrustItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reviewTrustText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  reviewTrustDivider: {
    width: 1,
    height: 12,
    backgroundColor: colors.border,
  },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  reviewCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  reviewAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reviewAuthor: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: "800",
  },
  reviewVerifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    gap: 2,
  },
  reviewVerifiedText: {
    color: "#059669",
    fontSize: 10,
    fontWeight: "700",
  },
  reviewDate: {
    color: colors.textMuted,
    fontSize: 11,
  },
  reviewMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  reviewRatingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  reviewPartnerChip: {
    backgroundColor: colors.primarySoft,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  reviewPartnerChipText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "700",
  },
  reviewServiceChip: {
    backgroundColor: colors.surface,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  reviewServiceChipText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  reviewContent: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: 20,
    marginBottom: 8,
  },
  reviewLocationText: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginBottom: 8,
  },
  reviewTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  reviewTag: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  reviewTagText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "600",
  },
});

