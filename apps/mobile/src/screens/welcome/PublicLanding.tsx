import React, { useRef } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import brandmark from '../../../assets/brandmark.png';
import { AppButton } from '../../components/ui';
import { AppIcon, type IconName } from '../../components/AppIcon';
import { CompanyInfoFooter } from '../../components/CompanyInfoFooter';
import { FadeInUp } from '../../components/motion';
import { useWideLayout } from '../../lib/layout';
import { theme } from '../../theme';
import { ProductShowcase } from '../store/ProductShowcase';
import { HeroPreview } from './HeroPreview';
import { Features, HowItWorks, PartnersSection } from './LandingSections';
import { LandingNav, type LandingSection } from './LandingNav';

/**
 * 로그인 전 홈페이지 — 첫 화면(Welcome)과 둘러보기(Guest)가 같이 쓴다.
 *
 * 웹(데스크톱)에서는 이 화면이 곧 회사 홈페이지다. 예전에는 넓은 화면 가운데에 소개 글과
 * 로그인 카드만 떠 있어 "폼 하나 띄운 페이지"로 보였다. 지금은 회사 사이트 구성 그대로:
 * 상단 메뉴바 → 대표 문구 + 화면 예시 → 이용 방법 → 서비스 특징 → 업체 회원 → 요금 → 사업자 정보.
 *
 * PG(KG이니시스) 심사는 홈페이지에서 판매 상품과 하단 사업자 정보(고객센터 포함)를 확인한다
 * — 요금 안내(ProductShowcase)와 푸터는 빼지 않는다.
 *
 * 앱(좁은 화면)은 같은 내용을 세로로 쌓되, 첫 화면 안에 로그인·회원가입 버튼이 보이게 둔다.
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
        {/* ── 대표 영역 */}
        <View
          style={[
            styles.hero,
            wide ? styles.heroWide : { paddingTop: insets.top + spacing.sm },
          ]}
        >
          <View style={[styles.inner, wide && styles.innerWide, wide && styles.heroRow]}>
            <View style={wide ? styles.heroCopyWide : undefined}>
              {!wide ? <MobileBrand onLongPress={onAdmin} /> : null}
              <FadeInUp delay={40}>
                <Text style={styles.eyebrow}>철거 · 운반 · 처리 매칭</Text>
                <Text
                  accessibilityRole="header"
                  style={[styles.heroTitle, wide && styles.heroTitleWide]}
                >
                  {'철거하고 남은 폐기물,\n운반·처리까지 맡기세요'}
                </Text>
                <Text style={[styles.heroLead, wide && styles.heroLeadWide]}>
                  철거업체·운반업체·처리장을 한 번에 연결하고, 올바로 전자인계서까지 처리합니다.
                </Text>
              </FadeInUp>

              <FadeInUp delay={200}>
                {wide ? (
                  <View style={styles.ctaRow}>
                    <AppButton label="지금 시작하기" onPress={onSignup} style={styles.ctaWide} />
                    <AppButton
                      label={onGuest ? '로그인 없이 둘러보기' : '로그인'}
                      variant="outline"
                      onPress={onGuest ?? onLogin}
                      style={[styles.ctaWide, styles.ctaWideSecondary]}
                    />
                  </View>
                ) : (
                  <View style={styles.ctaStack}>
                    <AppButton label="로그인" onPress={onLogin} />
                    <AppButton label="회원가입" variant="outline" onPress={onSignup} />
                    <View style={styles.linksRow}>
                      {onGuest ? (
                        <>
                          <TextLink label="로그인 없이 둘러보기" onPress={onGuest} />
                          <Text style={styles.linkDivider}>|</Text>
                        </>
                      ) : null}
                      <TextLink label="상품·요금 보기" onPress={() => jump('pricing')} />
                    </View>
                  </View>
                )}
                {wide ? <ProofPoints /> : null}
                {devShortcuts}
              </FadeInUp>
            </View>

            {wide ? (
              <FadeInUp delay={320} offset={24}>
                <HeroPreview />
              </FadeInUp>
            ) : null}
          </View>
        </View>

        {/* ── 본문 섹션 — 흰 바탕 / 회색 바탕을 번갈아 깔아 구획을 나눈다. */}
        <Band tone="gray" wide={wide} onLayout={mark('how')}>
          <HowItWorks />
        </Band>
        <Band tone="white" wide={wide} onLayout={mark('features')}>
          <Features />
        </Band>
        <Band tone="gray" wide={wide} onLayout={mark('partners')}>
          <PartnersSection onSignup={onSignup} />
        </Band>
        <Band tone="white" wide={wide} onLayout={mark('pricing')}>
          <ProductShowcase onBuy={onBuy} />
        </Band>

        <View style={{ paddingBottom: wide ? 0 : insets.bottom }}>
          <CompanyInfoFooter tone="dark" />
        </View>
      </ScrollView>
    </View>
  );
}

/** 앱 첫 줄 — 로고 + 서비스 이름. 길게 누르면 관리자 경로(운영자만 안다). */
function MobileBrand({ onLongPress }: { onLongPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="image"
      accessibilityLabel="비움"
      delayLongPress={1200}
      onLongPress={onLongPress}
      style={styles.brandRow}
    >
      <Image source={brandmark} style={styles.brandLogo} resizeMode="contain" />
      <Text style={styles.brandName}>비움</Text>
    </Pressable>
  );
}

const PROOF: ReadonlyArray<{ icon: IconName; label: string }> = [
  { icon: 'location', label: '전국 접수' },
  { icon: 'shield', label: '사업자 확인 업체' },
  { icon: 'document', label: '올바로 전자인계서' },
];

/** 대표 문구 아래 한 줄 — 이 서비스를 믿어도 되는 근거 세 가지. */
function ProofPoints() {
  return (
    <View style={styles.proofRow}>
      {PROOF.map((p, i) => (
        <View key={p.label} style={[styles.proofItem, i > 0 && styles.proofDivider]}>
          <AppIcon name={p.icon} size={22} color={colors.primary} filled />
          <Text style={styles.proofText}>{p.label}</Text>
        </View>
      ))}
    </View>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

/** 본문 구획 하나 — 바탕색 띠 + 가운데 본문 칸. */
function Band({
  tone,
  wide,
  onLayout,
  children,
}: {
  tone: 'white' | 'gray';
  wide: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <View
      onLayout={onLayout}
      style={[
        styles.band,
        tone === 'gray' && styles.bandGray,
        wide && styles.bandWide,
      ]}
    >
      <View style={[styles.inner, wide && styles.innerWide]}>{children}</View>
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
  heroWide: { paddingBottom: spacing.lg + spacing.lg, paddingTop: spacing.lg + spacing.lg },
  heroRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg + spacing.lg,
    justifyContent: 'space-between',
  },
  heroCopyWide: { flex: 1, maxWidth: 620 },
  brandRow: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.lg,
    minHeight: theme.touch.minButtonHeight,
  },
  brandLogo: { height: 32, width: 32 },
  brandName: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '700',
    letterSpacing: theme.tracking.title,
  },
  eyebrow: { color: colors.primary, fontSize: font.body, fontWeight: '700' },
  heroTitle: {
    color: colors.text,
    fontSize: font.titleLarge + 4,
    fontWeight: '700',
    letterSpacing: theme.tracking.title * 2,
    lineHeight: 44,
    marginTop: spacing.xs,
  },
  heroTitleWide: {
    fontSize: font.hero,
    letterSpacing: theme.tracking.display * 1.5,
    lineHeight: 68,
    marginTop: spacing.sm,
  },
  heroLead: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 28,
    marginTop: spacing.sm,
  },
  heroLeadWide: { fontSize: font.bodyLarge, lineHeight: 32, marginTop: spacing.md },
  ctaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  ctaWide: { minWidth: 200 },
  ctaWideSecondary: { height: theme.touch.primaryButtonHeight },
  ctaStack: { gap: spacing.xs, marginTop: spacing.lg },
  linksRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  linkText: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm, // 18px 글자 + 위아래 16 → 터치 높이 48 이상
  },
  linkDivider: { color: colors.border, fontSize: font.body, marginHorizontal: spacing.xs / 2 },
  proofRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.lg },
  proofItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingRight: spacing.sm,
  },
  proofDivider: {
    borderLeftColor: colors.border,
    borderLeftWidth: 1,
    paddingLeft: spacing.sm,
  },
  proofText: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  band: { backgroundColor: colors.background, paddingVertical: spacing.lg },
  bandGray: { backgroundColor: colors.appBackground },
  bandWide: { paddingVertical: spacing.lg * 3 },
});
