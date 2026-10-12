import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { offersTransportLabel } from '@dimol/shared';
import { AppIcon } from '../components/AppIcon';
import { MarketRateCard } from '../components/MarketRateCard';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, TabBar, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { AssignedJobList } from './home/JobCard';
import { IntakeQuoteList } from './home/IntakeQuoteList';
import { useMarketRate } from './home/useMarketRate';
import { useProviderJobs } from './home/useProviderJobs';
import { theme } from '../theme';

/**
 * 처리장 홈 — 들어온 반입 예약에 견적을 내고, 확정된 반입을 확인한다.
 *
 * 배너에 운반요청 제공 여부를 배지로 띄운다. 이 값이 켜져 있어야 배출자 쪽 목록에서
 * "운반까지 맡길 수 있는 처리장"으로 보이는데, 마이페이지 깊숙이에서만 켜고 끄다 보니
 * 지금 켜져 있는지를 잊는다.
 */
export function TreatmentPlantHomeScreen() {
  const user = useSession();
  const config = ROLE_CONFIG.WASTE_TREATMENT_PLANT;

  const { open, assigned, isFetching, refetch } = useProviderJobs(user.id);
  const rate = useMarketRate(config.marketRateParty);

  return (
    <View style={styles.screen}>
      <ScreenHeader title={`${user.name}${config.homeGreetingSuffix}`} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => void refetch()} />}
      >
        <FadeInUp delay={20}>
          <View style={styles.bannerContainer}>
            <View style={styles.bannerLeft}>
              <Text style={styles.bannerTitle}>정확하고 빠른 반입 처리</Text>
              <Text style={styles.bannerSubtitle}>비움 파트너스</Text>
              <View style={styles.transportBadge}>
                <Text style={styles.transportBadgeText}>
                  {offersTransportLabel(user.offersTransport)}
                </Text>
              </View>
            </View>
            <AppIcon name="building" size={48} color={colors.background} />
          </View>
        </FadeInUp>

        <MarketRateCard rate={rate} party={config.marketRateParty} />

        <IntakeQuoteList jobs={open} />

        <AssignedJobList title="확정된 반입" jobs={assigned} emptyText="확정된 반입이 없어요." />
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
    borderRadius: theme.radius.card,
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
    marginTop: spacing.xs,
  },
  transportBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  transportBadgeText: {
    color: colors.background,
    fontSize: font.caption,
    fontWeight: '700',
  },
});
