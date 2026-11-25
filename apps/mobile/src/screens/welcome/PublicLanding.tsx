import React, { useRef } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from '../../components/ui';
import { CompanyInfoFooter } from '../../components/CompanyInfoFooter';
import { HeroObject3D } from '../../components/three/HeroObject3D';
import { useWideLayout } from '../../lib/layout';
import { theme } from '../../theme';
import { ProductShowcase } from '../store/ProductShowcase';
import { ClosingCta, Features, HowItWorks, PartnersSection } from './LandingSections';
import { LandingNav, type LandingSection } from './LandingNav';
import { Band, MobileBrand, TextLink } from './LandingPrimitives';

/**
 * 로그인 전 홈페이지 — 첫 화면(Welcome)과 둘러보기(Guest)가 같이 쓴다.
 *
 * 흰 바탕에 큰 문장 하나 + 버튼 둘, 옆에 3D 오브젝트 하나. 그다음은 흰/회색 띠를 번갈아
 * 세 단계 → 특징 → 업체 회원 → 요금(PG 심사) → 마지막 시작 버튼 → 사업자 정보 순서.
 * 사진(AI 생성)과 어두운 띠는 쓰지 않는다.
 */
export function PublicLanding({
  onLogin,
  onSignup,
  onGuest,
  onBuy,
  onAdmin,
  devShortcuts,
}: {
  onLogin: () => void;
  onSignup: () => void;
  /** 로그인 없이 둘러보기 — 이미 둘러보기 중이면 없다. */
  onGuest?: () => void;
  /** 상품 안내의 "구매하기" — 로그인 후 스토어로 이어진다. */
  onBuy: () => void;
  /** 로고 길게 누르기 → 관리자 백오피스(공유 운영 토큰 경로). */
  onAdmin?: () => void;
  /** 개발 빌드 전용 역할 바로가기. */
  devShortcuts?: React.ReactNode;
}) {
  const wide = useWideLayout();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const web = Platform.OS === 'web';

  const offsets = useRef<Record<LandingSection, number>>({
    how: 0,
    features: 0,
    partners: 0,
    pricing: 0,
  });
  const mark = (key: LandingSection) => (e: LayoutChangeEvent) => {
    offsets.current[key] = e.nativeEvent.layout.y;
  };
  const jump = (key: LandingSection) =>
    scrollRef.current?.scrollTo({ y: offsets.current[key], animated: true });

  return (
    <View style={styles.screen}>
      {wide ? (
        <LandingNav onJump={jump} onLogin={onLogin} onSignup={onSignup} onLogoLongPress={onAdmin} />
      ) : null}
      <ScrollView ref={scrollRef} style={styles.screen} contentContainerStyle={styles.scroll}>
        <View
          style={[
            styles.hero,
            wide ? styles.heroWide : { paddingTop: insets.top + spacing.sm },
          ]}
        >
          <View style={[styles.inner, wide && styles.innerWide, wide && styles.heroRow]}>
            <View style={wide ? styles.heroCopyWide : undefined}>
              {!wide ? <MobileBrand onLongPress={onAdmin} /> : null}
              <Text
                accessibilityRole="header"
                style={[styles.heroTitle, wide && styles.heroTitleWide]}
              >
                {'철거 폐기물 처리,\n사진 한 장이면 돼요'}
              </Text>
              <Text style={[styles.heroLead, wide && styles.heroLeadWide]}>
                확인된 업체 견적 비교부터{'\n'}올바로 전자인계서까지 한 번에.
              </Text>

              {wide ? (
                <View style={styles.ctaRow}>
                  <AppButton label="무료로 시작하기" onPress={onSignup} style={styles.ctaWide} />
                  <AppButton
                    variant="secondary"
                    label={onGuest ? '둘러보기' : '로그인'}
                    onPress={onGuest ?? onLogin}
                    style={styles.ctaWide}
                  />
                </View>
              ) : (
                <View style={styles.ctaStack}>
                  <AppButton label="시작하기" onPress={onSignup} />
                  <AppButton variant="secondary" label="로그인" onPress={onLogin} />
                  <View style={styles.linksRow}>
                    {onGuest ? (
                      <>
                        <TextLink label="로그인 없이 둘러보기" onPress={onGuest} />
                        <Text style={styles.linkDivider}>|</Text>
                      </>
                    ) : null}
                    <TextLink label="요금 보기" onPress={() => jump('pricing')} />
                  </View>
                </View>
              )}

              {devShortcuts}
            </View>

            {web ? (
              <HeroObject3D style={wide ? styles.objectWide : styles.objectNarrow} />
            ) : null}
          </View>
        </View>

        <Band tone="grey" wide={wide} onLayout={mark('how')}>
          <HowItWorks />
        </Band>
        <Band tone="white" wide={wide} onLayout={mark('features')}>
          <Features />
        </Band>
        <Band tone="grey" wide={wide} onLayout={mark('partners')}>
          <PartnersSection onSignup={onSignup} />
        </Band>
        <Band tone="white" wide={wide} onLayout={mark('pricing')}>
          <ProductShowcase onBuy={onBuy} />
        </Band>
        <Band tone="grey" wide={wide}>
          <ClosingCta onStart={onSignup} />
        </Band>

        <View style={{ paddingBottom: wide ? 0 : insets.bottom }}>
          <CompanyInfoFooter />
        </View>
      </ScrollView>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  scroll: { flexGrow: 1 },
  inner: { alignSelf: 'center', paddingHorizontal: spacing.md, width: '100%' },
  innerWide: { maxWidth: theme.wideContentWidth },
  hero: { backgroundColor: colors.background, paddingBottom: spacing.lg },
  heroWide: { paddingBottom: spacing.lg * 2, paddingTop: spacing.lg * 2 },
  heroRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.lg },
  heroCopyWide: { flex: 1 },
  heroTitle: {
    color: colors.text,
    fontSize: font.display,
    fontWeight: '800',
    letterSpacing: theme.tracking.display,
    lineHeight: 46,
    marginTop: spacing.sm,
  },
  heroTitleWide: {
    fontSize: font.hero + 4,
    letterSpacing: theme.tracking.display * 1.5,
    lineHeight: 72,
    marginTop: 0,
  },
  heroLead: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    lineHeight: 30,
    marginTop: spacing.sm,
  },
  heroLeadWide: { fontSize: font.title, lineHeight: 36, marginTop: spacing.md },
  ctaRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.lg },
  ctaWide: { height: theme.touch.primaryButtonHeight, minWidth: 184 },
  ctaStack: { gap: spacing.xs, marginTop: spacing.lg },
  linksRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  linkDivider: { color: colors.borderStrong, fontSize: font.body, marginHorizontal: spacing.xs / 2 },
  objectWide: { flex: 1, height: 520 },
  objectNarrow: { height: 288, marginTop: spacing.md, width: '100%' },
});
