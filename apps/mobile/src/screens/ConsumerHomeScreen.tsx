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

export function ConsumerHomeScreen() {
  const nav = useNavigation();
  const user = useSession();
  const config = ROLE_CONFIG.CONSUMER;

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
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
    const [reqsRes, rateRes] = await Promise.allSettled([
      listRequests(user.id),
      config.marketRateParty ? getMarketRate(config.marketRateParty) : Promise.resolve(null),
    ]);
    if (reqsRes.status === 'fulfilled') setRequests(reqsRes.value);
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
            <View style={styles.cardBoxHeader}>
              <Text style={styles.cardBoxTitle}>철거 · 원상복구{'\n'}신청하기</Text>
              <Text style={styles.cardBoxSubtitle}>
                견적 비교부터 시공 완료까지 원스톱으로
              </Text>
            </View>

            <View style={styles.cardBoxIconWrap}>
              <View style={styles.cardBoxIconCircle}>
                <AppIcon name="hammer" size={68} color={theme.colors.primary} />
              </View>
            </View>

            <View style={styles.cardBoxFooter}>
              <Text style={styles.cardBoxFooterText}>간편 신청하기</Text>
              <Text style={styles.cardBoxFooterArrow}>➔</Text>
            </View>
          </Pressable>
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
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  contentPadding: {
    paddingHorizontal: 0,
  },
  bannerContainer: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    marginBottom: spacing.md,
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
    height: 280,
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    padding: spacing.md,
    shadowColor: '#0B1B3A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardBoxHeader: {
    alignItems: 'flex-start',
  },
  cardBoxTitle: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
    lineHeight: font.titleLarge + 6,
  },
  cardBoxSubtitle: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: 4,
  },
  cardBoxIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  cardBoxIconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primarySoft,
  },
  cardBoxFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  cardBoxFooterText: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  cardBoxFooterArrow: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '800',
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
});
