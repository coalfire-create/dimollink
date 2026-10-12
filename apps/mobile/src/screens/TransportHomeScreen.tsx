import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../components/AppIcon';
import { MarketRateCard } from '../components/MarketRateCard';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, TabBar, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { AvailabilityCard } from './home/AvailabilityCard';
import { AssignedJobList } from './home/JobCard';
import { OpenCallList } from './home/OpenCallList';
import { useMarketRate } from './home/useMarketRate';
import { useProviderJobs } from './home/useProviderJobs';
import { theme } from '../theme';

/**
 * 운반업체 홈 — 콜대기 스위치 + 들어온 콜 + 수락한 콜.
 *
 * 다른 홈과 달리 시작 버튼 그리드가 없다. 운반업체가 여기서 하는 일은 "받을지 말지"
 * 하나뿐이라, 콜대기 카드가 화면의 주인공이다.
 */
export function TransportHomeScreen() {
  const user = useSession();
  const config = ROLE_CONFIG.TRANSPORT_COMPANY;

  const { open, assigned, isFetching, refetch } = useProviderJobs(user.id);
  const rate = useMarketRate(config.marketRateParty);
  const reload = () => void refetch();

  return (
    <View style={styles.screen}>
      <ScreenHeader title={`${user.name}${config.homeGreetingSuffix}`} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={reload} />}
      >
        <FadeInUp delay={20}>
          <View style={styles.bannerContainer}>
            <View style={styles.bannerLeft}>
              <Text style={styles.bannerTitle}>안전하고 신속한 운반</Text>
              <Text style={styles.bannerSubtitle}>비움 파트너스</Text>
            </View>
            <AppIcon name="truck" size={48} color={colors.background} />
          </View>
        </FadeInUp>

        <FadeInUp delay={60}>
          <AvailabilityCard onChanged={reload} />
        </FadeInUp>

        <MarketRateCard rate={rate} party={config.marketRateParty} />

        <OpenCallList jobs={open} onAccepted={reload} />

        <AssignedJobList title="수락한 콜" jobs={assigned} emptyText="수락한 콜이 없어요." />
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
});
