import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { InlineEmpty, ListGroup, ListRow, SectionTitle } from '../components/ui';
import { MarketRateCard } from '../components/MarketRateCard';
import { FadeInUp } from '../components/motion';
import { TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG, requestsTabLabel } from '../roleConfig';
import { AssignedJobList } from './home/JobCard';
import { DemolitionJobCard } from './home/DemolitionJobCard';
import { PartnerHomeHeader } from './home/PartnerHomeHeader';
import { useMarketRate } from './home/useMarketRate';
import { useProviderJobs } from './home/useProviderJobs';
import { theme } from '../theme';

/**
 * 철거업체 홈 — 새로 들어온 철거 요청(위) + 수주한 철거 + 이어서 맡길 일(운반·처리장).
 *
 * 순서가 곧 우선순위다: 업체가 홈을 여는 이유는 새 요청이라 맨 위에 두고, 운반 부르기·
 * 처리장 예약은 철거를 따낸 뒤에 쓰는 도구라 아래 "이어서 맡기기"로 내린다.
 *
 * 새 요청 카드에 "바로 수락" 버튼이 없는 건 의도다. 철거 금액은 현장을 봐야 정해지는데
 * 사진만 보고 던진 금액을 계약금액으로 굳히면 실사 후 추가금 분쟁이 된다.
 * 개산(범위) → 실사 → 확정 순서로 가고, 금액은 견적 산정 화면에서 받는다
 * ([[demolition-estimate]]).
 */
export function DemolitionHomeScreen() {
  const nav = useNavigation();
  const user = useSession();
  const config = ROLE_CONFIG.DEMOLITION_COMPANY;
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
          openLabel="새 철거 요청"
          activeCount={assigned.length}
          activeLabel="수주한 철거"
        />

        <View style={styles.body}>
          <FadeInUp delay={40}>
            <SectionTitle>새 철거 요청</SectionTitle>
            {open.length > 0 ? (
              open.map((job) => (
                <DemolitionJobCard
                  key={job.id}
                  job={job}
                  onPress={() => nav.push({ name: 'estimateWorksheet', requestId: job.id })}
                />
              ))
            ) : (
              <InlineEmpty
                actionLabel="내 활동 지역 및 알림 설정"
                onAction={() => nav.switchTab('mypage')}
              >
                지금 들어온 철거 요청이 없어요.
              </InlineEmpty>
            )}
          </FadeInUp>

          <AssignedJobList title="수주한 철거" jobs={assigned} emptyText="수주한 철거가 없어요." />

          <SectionTitle>이어서 맡기기</SectionTitle>
          <ListGroup>
            <ListRow
              icon="truck"
              title="운반 차량 부르기"
              subtitle="철거 후 반출까지 이어서 맡겨요"
              hint="상·하차 주소와 폐기물을 입력해 운반을 요청합니다"
              onPress={() => nav.push({ name: 'requestForm', kind: 'TRANSPORT' })}
            />
            <ListRow
              icon="recycle"
              title="처리장 예약하기"
              subtitle="폐기물 반입 일정을 미리 잡아요"
              onPress={() => nav.push({ name: 'requestForm', kind: 'DISPOSAL_RESERVATION' })}
            />
          </ListGroup>

          <MarketRateCard rate={rate} party={config.marketRateParty} />
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
  content: {
    // 마지막 항목이 우하단 고객센터 버튼에 가리지 않게 밑단을 비운다.
    paddingBottom: theme.floatingButtonClearance + spacing.md,
  },
  body: {
    paddingHorizontal: spacing.sm,
  },
});
