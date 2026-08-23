import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS, type MarketRate, type ServiceRequest } from '@dimol/shared';
import { getMarketRate, listRequests } from '../api/client';
import { FEATURE_INTERIOR } from '../featureFlags';
import { AppIcon } from '../components/AppIcon';
import { Card, SectionTitle, StatusBadge } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { theme } from '../theme';

import brandmark from '../../assets/brandmark.png';

const MARKET_RATE_MIN_SAMPLE = 5;

const RATE_TITLE = {
  TRANSPORT: '요즘 운반 평균 시세',
  DISPOSAL: '요즘 처리 평균 시세',
} as const;

export function ConsumerHomeScreen() {
  const nav = useNavigation();
  const user = useSession();
  const config = ROLE_CONFIG.CONSUMER;
  const { homeActive } = config;

  const [active, setActive] = useState<ServiceRequest[]>([]);
  const [rate, setRate] = useState<MarketRate | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [activeRes, rateRes] = await Promise.allSettled([
      homeActive ? listRequests(user.id) : Promise.resolve(null),
      config.marketRateParty ? getMarketRate(config.marketRateParty) : Promise.resolve(null),
    ]);

    if (activeRes.status === 'fulfilled' && activeRes.value) {
      setActive(
        activeRes.value
          .filter((r) => r.status !== 'CANCELLED' && r.status !== 'SETTLED')
          .slice(0, 3)
      );
    }
    if (rateRes.status === 'fulfilled' && rateRes.value) {
      setRate(rateRes.value);
    }
  }, [user.id, homeActive, config.marketRateParty]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const renderActiveRequests = () => {
    if (!homeActive) return null;
    return (
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
          <View style={styles.emptyCard}>
            <AppIcon name="document" size={24} color={theme.colors.primary} />
            <Text style={styles.emptyCardText}>{homeActive.empty}</Text>
          </View>
        )}
      </>
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
        contentContainerStyle={styles.consumerContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <FadeInUp delay={40}>
          <View style={styles.bannerContainer}>
            <View style={styles.bannerLeft}>
              <Text style={styles.bannerTitle}>원스톱 폐기물 매칭</Text>
              <Text style={styles.bannerSubtitle}>철거를 더 쉽고, 더 똑똑하게</Text>
            </View>
            <Image source={brandmark} style={styles.bannerImage} resizeMode="contain" />
          </View>
        </FadeInUp>

        {/* 주요 서비스 기능 목록 (세로 카드 박스 배치) */}
        <View style={styles.featureList}>
          {/* 1. 철거 · 원상복구 신청하기 */}
          <FadeInUp delay={100}>
            <Pressable
              style={[styles.featureCard, styles.featureCardPrimary]}
              onPress={() => nav.push({ name: 'requestForm', kind: 'DEMOLITION' })}
            >
              <View style={[styles.featureIconCircle, styles.featureIconPrimary]}>
                <AppIcon name="hammer" size={26} color={theme.colors.primary} />
              </View>
              <View style={styles.featureTextBox}>
                <Text style={styles.featureTitle}>철거 · 원상복구 신청하기</Text>
                <Text style={styles.featureSubtitle}>검증된 철거 전문업체 무료 비교 견적</Text>
              </View>
              <Text style={styles.featureChevron}>›</Text>
            </Pressable>
          </FadeInUp>

          {/* 2. 현장 AI 분석 */}
          <FadeInUp delay={140}>
            <Pressable
              style={styles.featureCard}
              onPress={() => nav.push({ name: 'siteAnalysis' })}
            >
              <View style={[styles.featureIconCircle, styles.featureIconAi]}>
                <AppIcon name="camera" size={26} color="#7C3AED" />
              </View>
              <View style={styles.featureTextBox}>
                <Text style={styles.featureTitle}>현장 AI 사진 분석</Text>
                <Text style={styles.featureSubtitle}>사진으로 소재 · 철거공정 · 위험물 자동 식별</Text>
              </View>
              <Text style={styles.featureChevron}>›</Text>
            </Pressable>
          </FadeInUp>

          {/* 3. 폐기물 양 미리 계산 */}
          <FadeInUp delay={180}>
            <Pressable
              style={styles.featureCard}
              onPress={() => nav.push({ name: 'estimate' })}
            >
              <View style={[styles.featureIconCircle, styles.featureIconEstimate]}>
                <AppIcon name="sparkles" size={26} color="#D97706" />
              </View>
              <View style={styles.featureTextBox}>
                <Text style={styles.featureTitle}>폐기물 양 미리 계산</Text>
                <Text style={styles.featureSubtitle}>면적과 건물 유형으로 예상 톤수·비용 산출</Text>
              </View>
              <Text style={styles.featureChevron}>›</Text>
            </Pressable>
          </FadeInUp>

          {/* 4. 운반 차량 직접 부르기 */}
          <FadeInUp delay={220}>
            <Pressable
              style={styles.featureCard}
              onPress={() => nav.push({ name: 'requestForm', kind: 'TRANSPORT' })}
            >
              <View style={[styles.featureIconCircle, styles.featureIconTransport]}>
                <AppIcon name="truck" size={26} color={theme.colors.primary} />
              </View>
              <View style={styles.featureTextBox}>
                <Text style={styles.featureTitle}>운반 차량 직접 부르기</Text>
                <Text style={styles.featureSubtitle}>사진으로 소재·무게 자동 입력 및 빠른 배차</Text>
              </View>
              <Text style={styles.featureChevron}>›</Text>
            </Pressable>
          </FadeInUp>

          {/* 5. 인테리어 시공 역경매 견적 (선택) */}
          {FEATURE_INTERIOR ? (
            <FadeInUp delay={260}>
              <Pressable
                style={styles.featureCard}
                onPress={() => nav.push({ name: 'interiorForm' })}
              >
                <View style={[styles.featureIconCircle, styles.featureIconInterior]}>
                  <AppIcon name="tools" size={26} color="#059669" />
                </View>
                <View style={styles.featureTextBox}>
                  <Text style={styles.featureTitle}>인테리어 시공 역경매 견적</Text>
                  <Text style={styles.featureSubtitle}>여러 전문 검증 업체 비밀 견적 비교</Text>
                </View>
                <Text style={styles.featureChevron}>›</Text>
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
        </View>

        <View style={styles.contentPadding}>
          {renderActiveRequests()}
          {renderMarketRate()}
        </View>
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
  consumerContent: {
    paddingBottom: spacing.lg,
    backgroundColor: '#F6F7F9',
  },
  contentPadding: {
    paddingHorizontal: spacing.sm,
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
  cardPrimaryGradient: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
  },
  cardAiGradient: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
    borderWidth: 1,
    marginBottom: 12,
  },
  bannerImage: {
    width: 76,
    height: 76,
    position: 'absolute',
    right: 16,
    top: 22,
    zIndex: 1,
  },
  featureList: {
    paddingHorizontal: spacing.sm,
    gap: spacing.xs + 2,
    marginBottom: spacing.sm,
  },
  featureCard: {
    backgroundColor: colors.background,
    borderRadius: 20,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0B1B3A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  featureCardPrimary: {
    backgroundColor: '#F8FAFC',
    borderColor: '#BFDBFE',
    borderWidth: 1.5,
  },
  featureIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  featureIconPrimary: {
    backgroundColor: colors.primarySoft,
  },
  featureIconAi: {
    backgroundColor: '#F3E8FF',
  },
  featureIconEstimate: {
    backgroundColor: '#FEF3C7',
  },
  featureIconTransport: {
    backgroundColor: '#E0F2FE',
  },
  featureIconInterior: {
    backgroundColor: '#D1FAE5',
  },
  featureTextBox: {
    flex: 1,
  },
  featureTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  featureSubtitle: {
    color: colors.textMuted,
    fontSize: font.body - 3,
    marginTop: 3,
  },
  featureChevron: {
    color: colors.textMuted,
    fontSize: font.titleLarge,
    fontWeight: '700',
    marginLeft: spacing.xs,
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
  emptyCardIcon: {
    fontSize: 34,
    marginBottom: spacing.xs,
  },
  emptyCardText: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
    textAlign: 'center',
  },
});
