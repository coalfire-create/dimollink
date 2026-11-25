import React, { useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from '../../components/ui';
import { CompanyInfoFooter } from '../../components/CompanyInfoFooter';
import editorialLogistics from '../../../assets/editorial-logistics.png';
import editorialPlant from '../../../assets/editorial-plant.png';
import editorialSite from '../../../assets/editorial-site.png';
import { useWideLayout } from '../../lib/layout';
import { theme } from '../../theme';
import { ProductShowcase } from '../store/ProductShowcase';
import { Features, HowItWorks, PartnersSection } from './LandingSections';
import { LandingNav, type LandingSection } from './LandingNav';
import { Band, MobileBrand, TextLink } from './LandingPrimitives';

type HeroStageIndex = 0 | 1 | 2;

/** 히어로 3단계 — 탭을 고르면 배경 사진과 한 줄 설명이 바뀐다. */
const HERO_STAGES: ReadonlyArray<{
  index: HeroStageIndex;
  label: string;
  caption: string;
  image: ImageSourcePropType;
}> = [
  { index: 0, label: '현장 철거', caption: '현장 사진·주소로 철거 범위를 확인합니다.', image: editorialSite },
  { index: 1, label: '운반 배차', caption: '성상별로 분리해 가까운 차주에게 배차합니다.', image: editorialLogistics },
  { index: 2, label: '처리·올바로', caption: '적법 처리장 반입과 전자인계서까지 이어집니다.', image: editorialPlant },
];

/**
 * 로그인 전 홈페이지 — 첫 화면(Welcome)과 둘러보기(Guest)가 같이 쓴다.
 * 어두운 히어로 위에 철거·운반·처리 3D 모형을 두고,
 * 이어서 진행 순서·상품 요금(PG 심사)·사업자 정보 푸터가 나온다.
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
  const [stage, setStage] = useState<HeroStageIndex>(0);

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

  const activeMeta = HERO_STAGES[stage];

  return (
    <View style={styles.screen}>
      {wide ? (
        <LandingNav
          tone="dark"
          onJump={jump}
          onLogin={onLogin}
          onSignup={onSignup}
          onLogoLongPress={onAdmin}
        />
      ) : null}
      <ScrollView ref={scrollRef} style={styles.screen} contentContainerStyle={styles.scroll}>
        {/* ── 사진 히어로 */}
        <View
          style={[
            styles.hero,
            wide
              ? styles.heroWide
              : { paddingTop: insets.top + spacing.sm, paddingBottom: spacing.lg },
          ]}
        >
          <Image source={activeMeta.image} style={styles.heroPhoto} resizeMode="cover" />
          <View style={styles.heroShade} />
          <View style={[styles.inner, wide && styles.innerWide]}>
            <View style={wide ? styles.heroCopyWide : undefined}>
              {!wide ? <MobileBrand tone="dark" onLongPress={onAdmin} /> : null}
              <Text style={styles.eyebrow}>건설폐기물 철거 중개</Text>
              <Text
                accessibilityRole="header"
                style={[styles.heroTitle, wide && styles.heroTitleWide]}
              >
                {'철거 현장 폐기물,\n견적부터 올바로까지'}
              </Text>
              <Text style={[styles.heroLead, wide && styles.heroLeadWide]}>
                사업자 확인을 마친 업체의 견적을 비교하고, 올바로 전자인계서까지 한 번에 처리합니다.
              </Text>

              {wide ? (
                <View style={styles.ctaRow}>
                  <AppButton label="무료로 시작하기" onPress={onSignup} style={styles.ctaWide} />
                  <DarkGhostButton
                    label={onGuest ? '로그인 없이 둘러보기' : '로그인'}
                    onPress={onGuest ?? onLogin}
                  />
                </View>
              ) : (
                <View style={styles.ctaStack}>
                  <AppButton label="로그인" onPress={onLogin} />
                  <DarkGhostButton label="회원가입" onPress={onSignup} fullWidth />
                  <View style={styles.linksRow}>
                    {onGuest ? (
                      <>
                        <TextLink label="로그인 없이 둘러보기" tone="dark" onPress={onGuest} />
                        <Text style={styles.linkDivider}>|</Text>
                      </>
                    ) : null}
                    <TextLink
                      label="상품·요금 보기"
                      tone="dark"
                      onPress={() => jump('pricing')}
                    />
                  </View>
                </View>
              )}

              {devShortcuts}
            </View>
          </View>

          <View style={[styles.inner, wide && styles.innerWide]}>
            <View style={styles.stageTabs} accessibilityRole="tablist">
              {HERO_STAGES.map((item) => {
                const selected = item.index === stage;
                return (
                  <Pressable
                    key={item.label}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    onPress={() => setStage(item.index)}
                    style={[styles.stageTab, selected && styles.stageTabActive]}
                  >
                    <Text style={[styles.stageTabLabel, selected && styles.stageTabLabelActive]}>
                      {item.label}
                    </Text>
                    {selected ? <Text style={styles.stageCaption}>{item.caption}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>


        <Band tone="white" wide={wide} onLayout={mark('how')}>
          <HowItWorks />
        </Band>
        <Band tone="stone" wide={wide} onLayout={mark('features')}>
          <Features />
        </Band>
        <Band tone="dark" wide={wide} onLayout={mark('partners')}>
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

function DarkGhostButton({
  label,
  onPress,
  fullWidth,
}: {
  label: string;
  onPress: () => void;
  fullWidth?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.darkGhostBtn,
        fullWidth ? styles.darkGhostFull : styles.ctaWide,
        hovered && styles.darkGhostHovered,
      ]}
    >
      <Text style={styles.darkGhostLabel}>{label}</Text>
    </Pressable>
  );
}

const { colors, font, spacing, radius, touch, onDark } = theme;

const styles = StyleSheet.create({
  screen: { backgroundColor: onDark.canvas, flex: 1 },
  scroll: { flexGrow: 1 },
  inner: { alignSelf: 'center', paddingHorizontal: spacing.md, width: '100%' },
  innerWide: { maxWidth: theme.wideContentWidth },
  hero: {
    backgroundColor: onDark.canvas,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  heroWide: {
    minHeight: 640,
    paddingBottom: spacing.lg,
    paddingTop: spacing.lg * 2,
  },
  heroPhoto: { ...StyleSheet.absoluteFillObject, height: '100%', width: '100%' },
  /** 사진 위 글자 대비 — 먹색을 얹어 눌러 준다. */
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: onDark.canvas, opacity: 0.66 },
  heroCopyWide: { maxWidth: 560 },
  eyebrow: {
    color: onDark.textMuted,
    fontSize: font.caption,
    fontWeight: '600',
    letterSpacing: theme.tracking.title,
  },
  heroTitle: {
    color: colors.background,
    fontSize: font.titleLarge + 4,
    fontWeight: '700',
    letterSpacing: theme.tracking.title * 2,
    lineHeight: 44,
    marginTop: spacing.sm,
  },
  heroTitleWide: {
    fontSize: font.hero,
    letterSpacing: theme.tracking.display * 1.5,
    lineHeight: 64,
    marginTop: spacing.sm,
  },
  heroLead: {
    color: onDark.text,
    fontSize: font.body,
    lineHeight: 28,
    marginTop: spacing.sm,
  },
  heroLeadWide: {
    fontSize: font.bodyLarge,
    lineHeight: 32,
    marginTop: spacing.md,
  },
  ctaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  ctaWide: { minWidth: 196 },
  ctaStack: { gap: spacing.xs, marginTop: spacing.lg },
  darkGhostBtn: {
    alignItems: 'center',
    backgroundColor: onDark.surface,
    borderColor: onDark.border,
    borderRadius: radius.button,
    borderWidth: 1,
    height: touch.primaryButtonHeight,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  darkGhostFull: { width: '100%' },
  darkGhostHovered: {
    backgroundColor: onDark.divider,
    borderColor: onDark.textMuted,
  },
  darkGhostLabel: {
    color: colors.background,
    fontSize: font.body,
    fontWeight: '700',
  },
  linksRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  linkDivider: { color: onDark.border, fontSize: font.body, marginHorizontal: spacing.xs / 2 },
  stageTabs: {
    borderTopColor: onDark.textMuted,
    borderTopWidth: 1,
    flexDirection: 'row',
    marginTop: spacing.lg,
  },
  stageTab: {
    borderTopColor: 'transparent',
    borderTopWidth: 3,
    flex: 1,
    marginTop: -2,
    paddingRight: spacing.sm,
    paddingTop: spacing.sm,
  },
  stageTabActive: { borderTopColor: colors.background },
  stageTabLabel: { color: onDark.textMuted, fontSize: font.body, fontWeight: '600' },
  stageTabLabelActive: { color: colors.background, fontWeight: '700' },
  stageCaption: { color: onDark.text, fontSize: font.caption, marginTop: spacing.xs / 2 },
});
