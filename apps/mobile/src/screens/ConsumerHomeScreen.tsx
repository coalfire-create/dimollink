import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  CANCELLATION_PENALTY_RATE,
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  type RatingSummary,
  type ServiceRequest,
  type UserProfile,
} from '@dimol/shared';
import { getRatingSummary, listRequests, listUsers } from '../api/client';
import { FEATURE_INTERIOR } from '../featureFlags';
import { AppIcon } from '../components/AppIcon';
import { Card, ErrorBanner, SectionTitle, StatusBadge } from '../components/ui';
import { FadeInUp, PressableScale } from '../components/motion';
import { UserGuideModal } from '../components/UserGuideModal';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { hasSeenGuide, setSeenGuide } from '../lib/session-storage';
import { MarketRateCard } from '../components/MarketRateCard';
import { useMarketRate } from './home/useMarketRate';
import { theme } from '../theme';

/** 시세는 표본이 이만큼 쌓여야 보여준다 — 한두 건 평균은 오해를 부른다. */
/**
 * 홈에 노출하는 협력 업체.
 *
 * 평점·리뷰 수는 **실제 리뷰 집계(getRatingSummary)** 에서만 온다. 값이 없으면
 * 별점 자리를 아예 안 그린다 — 예전에 인덱스로 4.8/4.9 를 만들어 붙이던 코드가 있었는데,
 * 표시광고법상 문제가 되고 실제 평점이 쌓이면 숫자가 바뀌어 신뢰를 잃는다.
 * 배지(올바로·보험·허가증)는 회원 레코드에 실제로 저장된 검증 결과다.
 */
interface DemolitionPartner {
  id: string;
  name: string;
  region: string;
  rating: RatingSummary | null;
  allbaroCertified: boolean;
  insuranceRegistered: boolean;
  permitRegistered: boolean;
}

/**
 * "비움이 지키는 것" — 플랫폼이 실제로 코드로 보장하는 규칙만 적는다.
 * 수치는 전부 공유 상수에서 가져와, 정책이 바뀌면 문구도 같이 바뀐다.
 */
const GUARANTEES: { icon: 'document' | 'lock' | 'check'; title: string; body: string }[] = [
  {
    icon: 'document',
    title: '올바로 전자인계서 자동 처리',
    body: '의무 대상이면 매칭과 동시에 전자인계서를 발행합니다. 올바로에 따로 로그인하지 않아도 됩니다.',
  },
  {
    icon: 'lock',
    title: '검증된 업체만 매칭',
    body: '사업자등록번호 확인과 관리자 승인을 거친 업체에게만 요청이 전달됩니다.',
  },
  {
    icon: 'check',
    title: '배차 전 취소는 전액 환불',
    body: `배차 전에는 전액, 배차 후 작업 시작 전에는 위약금 ${Math.round(
      CANCELLATION_PENALTY_RATE * 100,
    )}%를 제외하고 환불합니다.`,
  },
];

function toPartner(user: UserProfile, rating: RatingSummary | null): DemolitionPartner {
  return {
    id: user.id,
    name: user.name,
    region: user.region ? `${user.region} 및 인근 지역` : '지역 미등록',
    rating,
    allbaroCertified: user.allbaroCertified,
    insuranceRegistered: user.insuranceRegistered,
    permitRegistered: user.permitRegistered,
  };
}

export function ConsumerHomeScreen() {
  const nav = useNavigation();
  const user = useSession();
  const config = ROLE_CONFIG.CONSUMER;

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [partners, setPartners] = useState<DemolitionPartner[]>([]);
  const [partnersLoaded, setPartnersLoaded] = useState(false);
  const rate = useMarketRate(config.marketRateParty);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    const [reqsRes, usersRes] = await Promise.allSettled([
      listRequests(user.id),
      listUsers({ userType: 'DEMOLITION_COMPANY', approvalStatus: 'APPROVED' }),
    ]);

    if (reqsRes.status === 'fulfilled') setRequests(reqsRes.value);

    if (usersRes.status === 'fulfilled' && usersRes.value) {
      // 평점은 업체별로 따로 불러온다. 하나가 실패해도 목록 자체는 뜨게 한다.
      const ratings = await Promise.all(
        usersRes.value.map((u) => getRatingSummary(u.id).catch(() => null)),
      );
      setPartners(usersRes.value.map((u, i) => toPartner(u, ratings[i])));
      setPartnersLoaded(true);
    }

    // 내 요청을 못 불러온 건 사용자가 알아야 한다(시세·업체 목록은 부가 정보).
    setLoadError(
      reqsRes.status === 'rejected'
        ? '내 요청을 불러오지 못했어요. 연결 상태를 확인해 주세요.'
        : null,
    );
  }, [user.id, config.marketRateParty]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const activeRequests = requests.filter(
    (r) => r.status !== 'COMPLETED' && r.status !== 'SETTLED' && r.status !== 'CANCELLED',
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title={`${user.name}${config.homeGreetingSuffix}`} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={styles.gutter}>
          <ErrorBanner message={loadError} onRetry={() => void load()} />
        </View>

        <FadeInUp delay={40}>
          <View style={styles.banner}>
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>철거를 더 쉽고, 더 똑똑하게</Text>
              <Text style={styles.bannerSubtitle}>새롭게 비우는 공식, 비움</Text>
            </View>
            <AppIcon name="building" size={48} color={colors.background} />
          </View>
        </FadeInUp>

        <FadeInUp delay={100}>
          <PressableScale
            accessibilityLabel="철거 · 원상복구 신청하기"
            accessibilityHint="현장 사진과 주소를 입력해 견적을 요청합니다"
            style={styles.ctaCard}
            onPress={() => nav.push({ name: 'requestForm', kind: 'DEMOLITION' })}
          >
            <View style={styles.ctaTextBox}>
              <Text style={styles.ctaTitle}>철거 · 원상복구{'\n'}신청하기</Text>
              <Text style={styles.ctaSubtitle}>사진 한 장이면 견적까지 한 번에</Text>
            </View>
            <View style={styles.ctaIconWrap}>
              <AppIcon name="hammer" size={40} color={colors.primary} />
            </View>
          </PressableScale>
        </FadeInUp>

        {activeRequests.length > 0 ? (
          <FadeInUp delay={140}>
            <View style={styles.gutter}>
              <SectionTitle>진행 중인 내 요청</SectionTitle>
              {activeRequests.map((req) => (
                <Card
                  key={req.id}
                  onPress={() => nav.push({ name: 'requestDetail', requestId: req.id })}
                >
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
          </FadeInUp>
        ) : null}

        <FadeInUp delay={180}>
          <View style={styles.gutter}>
            <SectionTitle>비움 협력 철거업체</SectionTitle>
            <Text style={styles.sectionSubtitle}>사업자 검증과 승인을 마친 업체입니다</Text>

            {partners.length === 0 ? (
              <Card style={styles.noticeCard}>
                <Text style={styles.noticeText}>
                  {partnersLoaded
                    ? '아직 등록된 협력 업체가 없어요. 요청을 올리시면 담당자가 직접 업체를 연결해 드립니다.'
                    : '협력 업체를 불러오는 중이에요.'}
                </Text>
              </Card>
            ) : (
              partners.map((partner) => (
                <View key={partner.id} style={styles.partnerCard}>
                  <View style={styles.partnerTopRow}>
                    <View style={styles.partnerLogo}>
                      <AppIcon name="hammer" size={24} color={colors.primary} />
                    </View>
                    <View style={styles.partnerInfo}>
                      <Text style={styles.partnerName} numberOfLines={2}>
                        {partner.name}
                      </Text>
                      <Text style={styles.partnerRegion} numberOfLines={1}>
                        {partner.region}
                      </Text>
                    </View>
                    {/* 평점은 실제 리뷰가 있을 때만. 없으면 자리 자체를 비운다. */}
                    {partner.rating && partner.rating.average !== null ? (
                      <View
                        accessibilityLabel={`평점 ${partner.rating.average}점, 리뷰 ${partner.rating.reviewCount}건`}
                        style={styles.ratingBox}
                      >
                        <Text style={styles.ratingScore}>{partner.rating.average.toFixed(1)}</Text>
                        <Text style={styles.ratingCount}>리뷰 {partner.rating.reviewCount}</Text>
                      </View>
                    ) : null}
                  </View>

                  {partner.allbaroCertified ||
                  partner.insuranceRegistered ||
                  partner.permitRegistered ? (
                    <View style={styles.verifyRow}>
                      {partner.allbaroCertified ? (
                        <Text style={styles.verifyItem}>✓ 올바로 연동</Text>
                      ) : null}
                      {partner.insuranceRegistered ? (
                        <Text style={styles.verifyItem}>✓ 배상책임보험</Text>
                      ) : null}
                      {partner.permitRegistered ? (
                        <Text style={styles.verifyItem}>✓ 허가증 등록</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </FadeInUp>

        <FadeInUp delay={220}>
          <View style={styles.gutter}>
            <SectionTitle>비움이 지키는 것</SectionTitle>
            <Card style={styles.guaranteeCard}>
              {GUARANTEES.map((g, i) => (
                <View
                  key={g.title}
                  style={[styles.guaranteeRow, i > 0 && styles.guaranteeRowDivided]}
                >
                  <View style={styles.guaranteeIcon}>
                    <AppIcon name={g.icon} size={20} color={colors.primary} />
                  </View>
                  <View style={styles.guaranteeTextBox}>
                    <Text style={styles.guaranteeTitle}>{g.title}</Text>
                    <Text style={styles.guaranteeBody}>{g.body}</Text>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        </FadeInUp>

        <FadeInUp delay={260}>
          <View style={styles.gutter}>
            <MarketRateCard rate={rate} party={config.marketRateParty} />
          </View>
        </FadeInUp>

        {/* 인테리어(밀봉 역경매)는 파일럿 밖 — FEATURE_INTERIOR 가 켜졌을 때만 노출한다. */}
        {FEATURE_INTERIOR ? (
          <FadeInUp delay={300}>
            <PressableScale
              accessibilityLabel="인테리어 시공 역경매 견적 신청하기"
              style={styles.interiorCard}
              onPress={() => nav.push({ name: 'interiorForm' })}
            >
              <View style={styles.interiorIcon}>
                <AppIcon name="tools" size={24} color={colors.primary} />
              </View>
              <View style={styles.interiorTextBox}>
                <Text style={styles.interiorTitle}>인테리어 시공 역경매 견적</Text>
                <Text style={styles.interiorSubtitle} numberOfLines={2}>
                  여러 검증 업체의 밀봉 견적을 비교하고 선택하세요
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </PressableScale>
          </FadeInUp>
        ) : null}
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

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.appBackground,
    flex: 1,
  },
  content: {
    paddingTop: spacing.sm,
    // 마지막 카드가 우하단 고객센터 버튼에 가리지 않도록 밑단을 비운다.
    paddingBottom: theme.floatingButtonClearance + spacing.md,
  },
  /** 좌우 공통 여백 — 카드마다 marginHorizontal 을 따로 주지 않는다. */
  gutter: {
    paddingHorizontal: spacing.sm,
  },
  banner: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginHorizontal: spacing.sm,
    padding: spacing.md,
  },
  bannerText: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  bannerTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: font.body,
    fontWeight: '600',
  },
  bannerSubtitle: {
    color: colors.background,
    fontSize: font.title,
    fontWeight: '800',
    marginTop: spacing.xs / 2,
  },
  ctaCard: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.card,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginHorizontal: spacing.sm,
    padding: spacing.md,
    ...theme.shadow.card,
  },
  ctaTextBox: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  ctaTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    lineHeight: 32,
  },
  ctaSubtitle: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
  ctaIconWrap: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.badge,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginBottom: spacing.sm,
    marginTop: -spacing.xs,
  },
  noticeCard: {
    backgroundColor: colors.surface,
  },
  noticeText: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 26,
  },
  partnerCard: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    marginBottom: spacing.sm,
    padding: spacing.md,
    ...theme.shadow.card,
  },
  partnerTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  partnerLogo: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.badge,
    height: 48,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 48,
  },
  partnerInfo: {
    flex: 1,
  },
  partnerName: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  partnerRegion: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
  },
  ratingBox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    marginLeft: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  ratingScore: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  ratingCount: {
    color: colors.textMuted,
    fontSize: font.caption,
  },
  verifyRow: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  verifyItem: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  guaranteeCard: {
    padding: 0,
  },
  guaranteeRow: {
    flexDirection: 'row',
    padding: spacing.md,
  },
  guaranteeRowDivided: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  guaranteeIcon: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.badge,
    height: 40,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 40,
  },
  guaranteeTextBox: {
    flex: 1,
  },
  guaranteeTitle: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '800',
  },
  guaranteeBody: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
    marginTop: spacing.xs / 2,
  },
  requestRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  requestTitle: {
    color: colors.text,
    flexShrink: 1,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    marginRight: spacing.xs,
  },
  requestMeta: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
  interiorCard: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.card,
    flexDirection: 'row',
    marginHorizontal: spacing.sm,
    padding: spacing.md,
    ...theme.shadow.card,
  },
  interiorIcon: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.badge,
    height: 48,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 48,
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
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
  },
  chevron: {
    color: colors.primary,
    fontSize: font.titleLarge,
    fontWeight: '800',
    marginLeft: spacing.xs,
  },
});
