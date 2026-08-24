import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  type MarketRate,
  type ServiceRequest,
} from '@dimol/shared';
import { getMarketRate, listRequests } from '../api/client';
import { FEATURE_INTERIOR } from '../featureFlags';
import { AppIcon } from '../components/AppIcon';
import { Card, SectionTitle, StatusBadge } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { theme } from '../theme';

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
          .slice(0, 3),
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
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <FadeInUp delay={40}>
          <View style={styles.bannerContainer}>
            <View style={styles.bannerLeft}>
              <Text style={styles.bannerTitle}>철거를 더 쉽고, 더 똑똑하게</Text>
              <Text style={styles.bannerSubtitle}>새롭게 비우는 공식, 비움</Text>
            </View>
            <Text style={{ fontSize: 70, position: 'absolute', right: 20, bottom: 20 }}>✨</Text>
          </View>
        </FadeInUp>

        <View style={styles.gridContainer}>
          <View style={styles.gridLeft}>
            <FadeInUp delay={100}>
              <Pressable
                style={styles.cardLarge}
                onPress={() => nav.push({ name: 'requestForm', kind: 'DEMOLITION' })}
              >
                <Text style={styles.cardLargeTitle}>철거 · 원상복구{'\n'}신청하기</Text>
                <Text style={{ fontSize: 72, textAlign: 'center', marginTop: 20 }}>👷</Text>
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
                  <Text style={{ fontSize: 36 }}>📷</Text>
                </View>
              </Pressable>
            </FadeInUp>
            <FadeInUp delay={220}>
              <Pressable style={styles.cardSmall} onPress={() => nav.push({ name: 'estimate' })}>
                <View style={styles.cardSmallContent}>
                  <Text style={styles.cardSmallTitle}>폐기물 양{'\n'}계산</Text>
                  <Text style={{ fontSize: 36 }}>📐</Text>
                </View>
              </Pressable>
            </FadeInUp>
          </View>
        </View>

        {/* 소비자가 직접 운반 차량을 부른다(사진으로 소재·무게 자동 채움 가능). */}
        <FadeInUp delay={240}>
          <Pressable
            style={styles.interiorCard}
            onPress={() => nav.push({ name: 'requestForm', kind: 'TRANSPORT' })}
          >
            <Text style={styles.interiorEmoji}>🚚</Text>
            <View style={styles.interiorTextBox}>
              <Text style={styles.interiorTitle}>운반 차량 직접 부르기</Text>
              <Text style={styles.interiorSubtitle} numberOfLines={2}>
                사진 한 장이면 소재·무게를 자동으로 채워 드려요
              </Text>
            </View>
            <Text style={styles.interiorChevron}>›</Text>
          </Pressable>
        </FadeInUp>

        {/* 인테리어(밀봉 역경매)는 파일럿 밖 — FEATURE_INTERIOR 가 켜졌을 때만 노출한다. */}
        {FEATURE_INTERIOR ? (
          <FadeInUp delay={260}>
            <Pressable
              style={styles.interiorCard}
              onPress={() => nav.push({ name: 'interiorForm' })}
            >
              <Text style={styles.interiorEmoji}>🛠️</Text>
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
});
