import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../components/AppIcon';
import { ErrorBanner } from '../components/ui';
import { MarketRateCard } from '../components/MarketRateCard';
import { UserGuideModal } from '../components/UserGuideModal';
import { FadeInUp, PressableScale } from '../components/motion';
import { FEATURE_INTERIOR } from '../featureFlags';
import { TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { GuaranteeCard } from './home/GuaranteeCard';
import { NextStepCard } from './home/NextStepCard';
import { PartnerList } from './home/PartnerList';
import { useConsumerHome } from './home/useConsumerHome';
import { useMarketRate } from './home/useMarketRate';
import { requesterNextStep } from '../lib/request-next-step';
import { theme } from '../theme';

/**
 * 배출자 홈 — 지금 할 일(위) + 새로 시작하기 + 믿을 근거(아래).
 *
 * 순서가 곧 우선순위다: 결제처럼 사용자가 손을 써야 멈춘 건이 있으면 그게 맨 위,
 * 그다음이 이 앱에 온 이유인 철거 신청이다. 신청 버튼은 진행 중인 건이 있어도
 * 항상 보인다(예전에는 진행 중인 건이 생기면 사라져 두 번째 현장을 신청할 길이 없었다).
 * 협력 업체·보장 규칙은 "정말 맡겨도 되나"를 확인하려 내려오는 자리라 아래에 둔다.
 *
 * 데이터는 [[useConsumerHome]] 에, 각 블록은 `screens/home/` 에 있다.
 */
export function ConsumerHomeScreen() {
  const nav = useNavigation();
  const user = useSession();
  const config = ROLE_CONFIG.CONSUMER;
  const home = useConsumerHome();
  const rate = useMarketRate(config.marketRateParty);

  const insets = useSafeAreaInsets();
  // 손을 써야 하는 건(결제 등)을 위로. 같은 그룹 안에서는 서버 순서를 지킨다.
  const active = [...home.activeRequests].sort(
    (a, b) =>
      Number(requesterNextStep(b).needsAttention) - Number(requesterNextStep(a).needsAttention),
  );
  const shown = active.slice(0, MAX_HOME_REQUESTS);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        refreshControl={
          <RefreshControl refreshing={home.refreshing} onRefresh={() => void home.refresh()} />
        }
      >
        <View style={styles.greeting} accessibilityRole="header">
          <Text style={styles.greetingName}>
            {user.name}
            {config.homeGreetingSuffix}
          </Text>
          <Text style={styles.greetingTitle}>
            {active.length > 0 ? '진행 중인 일을 확인해 보세요' : '무엇을 비워 드릴까요?'}
          </Text>
        </View>

        <View style={styles.gutter}>
          <ErrorBanner message={home.loadError} onRetry={() => void home.load()} />
        </View>

        {shown.length > 0 ? (
          <FadeInUp delay={40}>
            <View style={styles.gutter}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>지금 할 일</Text>
                {active.length > shown.length ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`진행 중인 요청 ${active.length}건 모두 보기`}
                    onPress={() => nav.switchTab('requests')}
                    style={styles.moreLink}
                  >
                    <Text style={styles.moreLabel}>{active.length}건 모두 보기 ›</Text>
                  </Pressable>
                ) : null}
              </View>
              {shown.map((request) => (
                <NextStepCard key={request.id} request={request} />
              ))}
            </View>
          </FadeInUp>
        ) : null}

        <FadeInUp delay={100}>
          <PressableScale
            accessibilityLabel="철거 · 원상복구 신청하기"
            accessibilityHint="현장 사진과 주소를 입력해 견적을 요청합니다"
            style={styles.ctaCard}
            onPress={() => nav.push({ name: 'requestForm', kind: 'DEMOLITION' })}
          >
            <View style={styles.ctaTextBox}>
              <Text style={styles.ctaTitle}>
                {active.length > 0 ? '다른 현장도 신청하기' : '철거 · 원상복구\n신청하기'}
              </Text>
              <Text style={styles.ctaSubtitle}>사진 한 장이면 업체 견적까지 한 번에</Text>
            </View>
            <View style={styles.ctaIconWrap}>
              <AppIcon name="hammer" size={40} color={colors.primary} />
            </View>
          </PressableScale>
        </FadeInUp>

        <FadeInUp delay={180}>
          <View style={styles.gutter}>
            <PartnerList partners={home.partners} loaded={home.partnersLoaded} />
          </View>
        </FadeInUp>

        <FadeInUp delay={220}>
          <View style={styles.gutter}>
            <GuaranteeCard />
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
        visible={home.showGuide}
        onClose={home.closeGuide}
        onNeverShowAgain={home.dismissGuideForever}
        isNewUser={home.requests.length === 0}
      />
    </View>
  );
}

/** 홈에 펼쳐 둘 진행 건 수 — 그 이상은 "모두 보기"로 이용내역 탭에 맡긴다. */
const MAX_HOME_REQUESTS = 3;

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.appBackground,
    flex: 1,
  },
  content: {
    // 마지막 카드가 우하단 고객센터 버튼에 가리지 않도록 밑단을 비운다.
    paddingBottom: theme.floatingButtonClearance + spacing.md,
  },
  gutter: {
    paddingHorizontal: spacing.sm,
  },
  greeting: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  greetingName: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  greetingTitle: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
    lineHeight: 38,
    marginTop: spacing.xs,
  },
  sectionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  moreLink: {
    justifyContent: 'center',
    minHeight: theme.touch.minButtonHeight,
  },
  moreLabel: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
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
