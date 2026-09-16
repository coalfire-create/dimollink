import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../components/AppIcon';
import { ErrorBanner } from '../components/ui';
import { MarketRateCard } from '../components/MarketRateCard';
import { UserGuideModal } from '../components/UserGuideModal';
import { FadeInUp, PressableScale } from '../components/motion';
import { FEATURE_INTERIOR } from '../featureFlags';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { ActiveRequestDashboard } from './home/ActiveRequestDashboard';
import { GuaranteeCard } from './home/GuaranteeCard';
import { PartnerList } from './home/PartnerList';
import { useConsumerHome } from './home/useConsumerHome';
import { useMarketRate } from './home/useMarketRate';
import { theme } from '../theme';

/**
 * 배출자 홈 — 무엇을 시작할 수 있는지(위) + 지금 진행 중인 것 + 믿을 근거(아래).
 *
 * 순서가 곧 우선순위다: 철거 신청이 이 앱에 온 이유라 가장 크게 위에 두고,
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

  return (
    <View style={styles.screen}>
      <ScreenHeader title={`${user.name}${config.homeGreetingSuffix}`} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={home.refreshing} onRefresh={() => void home.refresh()} />
        }
      >
        <View style={styles.gutter}>
          <ErrorBanner message={home.loadError} onRetry={() => void home.load()} />
        </View>

        {home.activeRequests.length > 0 ? (
          <FadeInUp delay={40}>
            <ActiveRequestDashboard requests={home.activeRequests} />
          </FadeInUp>
        ) : (
          <>
            <FadeInUp delay={40}>
              <View style={styles.banner}>
                <View style={styles.bannerText}>
                  <Text style={styles.bannerTitle}>철거를 더 쉽고, 더 똑똑하게</Text>
                  <Text style={styles.bannerSubtitle}>새롭게 비우는 공식, 비움</Text>
                </View>
                <AppIcon name="building" size={48} color={colors.background} />
              </View>
            </FadeInUp>

            <FadeInUp delay={100}>
              <PressableScale
                accessibilityLabel="철거 · 원상복구 신청하기"
                accessibilityHint="현장 사진과 주소를 입력해 견적을 요청합니다"
                style={styles.ctaCard}
                onPress={() => nav.push({ name: 'requestForm', kind: 'DEMOLITION' })}
              >
                <View style={styles.ctaTextBox}>
                  <Text style={styles.ctaTitle}>철거 · 원상복구{'\n'}신청하기</Text>
                  <Text style={styles.ctaSubtitle}>사진 한 장이면 견적까지 한 번에</Text>
                </View>
                <View style={styles.ctaIconWrap}>
                  <AppIcon name="hammer" size={40} color={colors.primary} />
                </View>
              </PressableScale>
            </FadeInUp>
          </>
        )}

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

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.appBackground,
    flex: 1,
  },
  content: {
    paddingTop: spacing.sm,
    // 마지막 카드가 우하단 고객센터 버튼에 가리지 않도록 밑단을 비운다.
    paddingBottom: theme.floatingButtonClearance + spacing.md,
  },
  gutter: {
    paddingHorizontal: spacing.sm,
  },
  banner: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginHorizontal: spacing.sm,
    padding: spacing.md,
  },
  bannerText: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  bannerTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: font.body,
    fontWeight: '600',
  },
  bannerSubtitle: {
    color: colors.background,
    fontSize: font.title,
    fontWeight: '800',
    marginTop: spacing.xs / 2,
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
