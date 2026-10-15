import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../components/AppIcon';
import { SectionTitle, InlineEmpty } from '../components/ui';
import { MarketRateCard } from '../components/MarketRateCard';
import { FadeInUp, PressableScale } from '../components/motion';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { AssignedJobList } from './home/JobCard';
import { DemolitionJobCard } from './home/DemolitionJobCard';
import { useMarketRate } from './home/useMarketRate';
import { useProviderJobs } from './home/useProviderJobs';
import { theme } from '../theme';

/**
 * 철거업체 홈 — 시작 버튼(운반·처리장) + 새로 들어온 철거 요청 + 수주한 철거.
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
      <ScreenHeader title={`${user.name}${config.homeGreetingSuffix}`} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => void refetch()} />}
      >
        <FadeInUp delay={40}>
          <View style={styles.bannerContainer}>
            <View style={styles.bannerLeft}>
              <Text style={styles.bannerTitle}>철거 후 처리도 완벽하게</Text>
              <Text style={styles.bannerSubtitle}>비움 파트너스</Text>
            </View>
            <View style={styles.bannerIcon}>
              <AppIcon name="building" size={48} color={colors.background} />
            </View>
          </View>
        </FadeInUp>

        <FadeInUp delay={100}>
          <PressableScale
            accessibilityLabel="운반 차량 부르기"
            accessibilityHint="상·하차 주소와 폐기물을 입력해 운반을 요청합니다"
            style={styles.cardBox}
            onPress={() => nav.push({ name: 'requestForm', kind: 'TRANSPORT' })}
          >
            <View style={styles.cardBoxText}>
              <Text style={styles.cardBoxTitle}>운반 차량{'\n'}부르기</Text>
              <Text style={styles.cardBoxSubtitle}>철거 후 반출까지 이어서 맡겨요</Text>
            </View>
            <View style={styles.cardBoxIconWrap}>
              <AppIcon name="truck" size={40} color={colors.primary} />
            </View>
          </PressableScale>
        </FadeInUp>

        <FadeInUp delay={260}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="처리장 예약하기"
            style={styles.interiorCard}
            onPress={() => nav.push({ name: 'requestForm', kind: 'DISPOSAL_RESERVATION' })}
          >
            <AppIcon name="recycle" size={26} color={colors.primary} />
            <View style={styles.interiorTextBox}>
              <Text style={styles.interiorTitle}>처리장 예약하기</Text>
              <Text style={styles.interiorSubtitle}>폐기물 반입 일정을 미리 잡아요</Text>
            </View>
            <Text style={styles.interiorChevron}>›</Text>
          </Pressable>
        </FadeInUp>

        <MarketRateCard rate={rate} party={config.marketRateParty} />

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
          <InlineEmpty>지금 들어온 철거 요청이 없어요.</InlineEmpty>
        )}

        <AssignedJobList title="수주한 철거" jobs={assigned} emptyText="수주한 철거가 없어요." />
      </ScrollView>
      <TabBar active="home" />
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  bannerIcon: {
    bottom: 24,
    position: 'absolute',
    right: 24,
  },
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
    color: colors.background,
    fontSize: font.title,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  cardBox: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: theme.radius.card,
    borderWidth: 1.5,
    // 높이를 200 으로 고정해 두면 내용이 위아래로 벌어져 가운데가 텅 빈다.
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
    ...theme.shadow.card,
  },
  cardBoxText: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  cardBoxTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    lineHeight: font.title + 6,
  },
  cardBoxSubtitle: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: font.body + 8,
    marginTop: spacing.xs,
  },
  cardBoxIconWrap: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: theme.radius.badge,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  interiorCard: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.border,
    borderRadius: theme.radius.card,
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
    marginTop: spacing.xs,
  },
  interiorChevron: {
    color: colors.primary,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
});
