import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { offersTransportLabel } from '@dimol/shared';
import { MarketRateCard } from '../components/MarketRateCard';
import { TabBar, useSession } from '../navigation';
import { ROLE_CONFIG, requestsTabLabel } from '../roleConfig';
import { AssignedJobList } from './home/JobCard';
import { IntakeQuoteList } from './home/IntakeQuoteList';
import { PartnerHomeHeader } from './home/PartnerHomeHeader';
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
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => void refetch()} />}
      >
        <PartnerHomeHeader
          canOpenList={requestsTabLabel(user.userType) !== null}
          name={`${user.name}${config.homeGreetingSuffix}`}
          openCount={open.length}
          openLabel="새 반입 예약"
          activeCount={assigned.length}
          activeLabel="확정된 반입"
          badge={offersTransportLabel(user.offersTransport)}
        />
        <View style={styles.body}>
          <MarketRateCard rate={rate} party={config.marketRateParty} />

          <IntakeQuoteList jobs={open} />

          <AssignedJobList title="확정된 반입" jobs={assigned} emptyText="확정된 반입이 없어요." />
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
