import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { MarketRateCard } from '../components/MarketRateCard';
import { WideColumns } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { TabBar, useSession } from '../navigation';
import { ROLE_CONFIG, requestsTabLabel } from '../roleConfig';
import { AvailabilityCard } from './home/AvailabilityCard';
import { AssignedJobList } from './home/JobCard';
import { OpenCallList } from './home/OpenCallList';
import { PartnerHomeHeader } from './home/PartnerHomeHeader';
import { useMarketRate } from './home/useMarketRate';
import { useProviderJobs } from './home/useProviderJobs';
import { useWideLayout } from '../lib/layout';
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
  const wide = useWideLayout();
  // 모바일은 콜대기 바로 아래, 데스크톱 웹은 오른쪽 칸 맨 위.
  const marketRate = <MarketRateCard rate={rate} party={config.marketRateParty} />;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={reload} />}
      >
        <PartnerHomeHeader
          canOpenList={requestsTabLabel(user.userType) !== null}
          name={`${user.name}${config.homeGreetingSuffix}`}
          openCount={open.length}
          openLabel="들어온 콜"
          activeCount={assigned.length}
          activeLabel="수락한 콜"
        />
        <View style={styles.body}>
          {/* 데스크톱 웹: 콜대기·들어온 콜(왼쪽) | 시세·수락한 콜(오른쪽). 모바일 순서는 그대로. */}
          <WideColumns
            main={
              <>
                <FadeInUp delay={60}>
                  <AvailabilityCard onChanged={reload} />
                </FadeInUp>
                {wide ? null : marketRate}
                <OpenCallList jobs={open} onAccepted={reload} />
              </>
            }
            side={
              <>
                {wide ? marketRate : null}
                <AssignedJobList
                  title="수락한 콜"
                  jobs={assigned}
                  emptyText="수락한 콜이 없어요."
                />
              </>
            }
          />
        </View>
      </ScrollView>
      <TabBar active="home" />
    </View>
  );
}

const { colors, spacing } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.appBackground,
    flex: 1,
  },
  body: {
    paddingHorizontal: spacing.sm,
  },
  content: {
    // 마지막 항목이 우하단 고객센터 버튼에 가리지 않게 밑단을 비운다.
    paddingBottom: theme.floatingButtonClearance + spacing.md,
  },
});
