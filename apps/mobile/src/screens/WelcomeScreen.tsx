import React, { useRef } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import brandmark from '../../assets/brandmark.png';
import { AppButton } from '../components/ui';
import { CompanyInfoFooter } from '../components/CompanyInfoFooter';
import { FadeInUp } from '../components/motion';
import { ProductShowcase } from './store/ProductShowcase';
import { DevRoleShortcuts, type DevRoleKey } from './welcome/DevRoleShortcuts';
import { theme } from '../theme';

/**
 * 진입 게이트 — 앱을 열면 가장 먼저 보이는 화면.
 * 레퍼런스 디자인(007~009.png): 파란 전면 배경 + 대형 타이포 + 소파 일러스트 + 하단 흰 시트.
 * 로그인 / 회원가입으로만 서비스에 들어갈 수 있고, 둘러보기(게스트)는 별도 경로.
 *
 * 첫 화면은 웹에서 곧 **홈페이지**다. PG(KG이니시스) 심사가 홈페이지에서 판매 상품과
 * 하단 사업자 정보(고객센터 전화 포함)를 확인하므로, 첫 뷰포트 아래로 상품 안내와 푸터를
 * 이어 붙인다. 첫 뷰포트(파란 히어로 + 버튼 시트)는 화면 높이를 꽉 채워 그대로 둔다.
 */
export function WelcomeScreen({
  onLogin,
  onSignup,
  onGuest,
  onBuy,
  onAdmin,
  onDevRoleSelect,
}: {
  onLogin: () => void;
  onSignup: () => void;
  onGuest: () => void;
  /** 상품 안내의 "구매하기" — 로그인 후 스토어로 이어진다. */
  onBuy: () => void;
  onAdmin?: () => void;
  onDevRoleSelect?: (role: DevRoleKey) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const productsY = useRef(0);
  return (
    <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.scroll}>
      <View
        style={{ minHeight: height }}
        onLayout={(e) => {
          // 상품 안내는 이 첫 뷰포트 바로 아래에서 시작한다 — 자기 높이가 곧 스크롤 목표다.
          productsY.current = e.nativeEvent.layout.height;
        }}
      >
        {/* 상단: 파란색 배경 + 로고 + 타이포.
          파란 배경은 상태바까지 꽉 채우고, 내용만 노치 아래로 내린다. */}
        <View style={[styles.heroSection, { paddingTop: insets.top + spacing.lg }]}>
          <Pressable
            accessibilityRole="image"
            accessibilityLabel="비움 로고"
            delayLongPress={1200}
            onLongPress={onAdmin}
            style={[styles.logoWrap, { top: insets.top + spacing.sm }]}
          >
            <Image source={brandmark} style={styles.logoImage} resizeMode="contain" />
          </Pressable>
          <FadeInUp delay={40}>
            <Text style={styles.heroTitle}>{'철거부터\n처리까지\n비움'}</Text>
          </FadeInUp>
          <FadeInUp delay={160}>
            <Text style={styles.heroSubtitle}>
              {'건설폐기물 전국 매칭 플랫폼\n올바로 전자인계서 자동화'}
            </Text>
          </FadeInUp>

          {/* 핵심 강점 — 빈 공간을 채우고 가치를 전달 */}
          <FadeInUp delay={240}>
            <View style={styles.features}>
              {[
                '전국 어디나 · 건설폐기물 전문',
                '올바로 전자인계서 자동 처리',
                '여러 업체 견적 비교 후 선택',
              ].map((t) => (
                <View key={t} style={styles.featureRow}>
                  <View style={styles.featureCheck}>
                    <Text style={styles.featureCheckText}>✓</Text>
                  </View>
                  <Text style={styles.featureText}>{t}</Text>
                </View>
              ))}
            </View>
          </FadeInUp>
        </View>

        {/* 하단: 흰색 라운드 시트 — 홈 인디케이터 위로 버튼을 띄운다. */}
        <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          {/* 말풍선 */}
          <FadeInUp delay={360}>
            <View style={styles.speechBubble}>
              <Text style={styles.speechBubbleText}>전국 서비스 · 10초 가입</Text>
              <View style={styles.speechBubbleTail} />
            </View>
          </FadeInUp>

          <FadeInUp delay={420}>
            <AppButton label="로그인" onPress={onLogin} />
            <View style={{ height: theme.spacing.sm }} />
            <AppButton label="회원가입" variant="outline" onPress={onSignup} />
          </FadeInUp>

          <FadeInUp delay={480}>
            <View style={styles.linksRow}>
              <Pressable accessibilityRole="button" onPress={onGuest}>
                <Text style={styles.linkText}>로그인 없이 둘러보기</Text>
              </Pressable>
              <Text style={styles.linkDivider}>|</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  scrollRef.current?.scrollTo({ y: productsY.current, animated: false })
                }
              >
                <Text style={styles.linkText}>상품·요금 보기</Text>
              </Pressable>
              {/* 관리자 백오피스(공유 운영 토큰 경로)는 일반 사용자에게 보일 이유가 없다.
                링크를 지우는 대신 로고를 길게 눌러 들어가게 남겨 뒀다 — 운영자는 알고
                쓰고, 일반 사용자 눈에는 안 띈다. */}
            </View>
          </FadeInUp>

          {/* UI 검증용 로그인 없는 빠른 진입 칩 */}
          {onDevRoleSelect ? (
            <FadeInUp delay={520}>
              <DevRoleShortcuts onSelect={onDevRoleSelect} />
            </FadeInUp>
          ) : null}
        </View>
      </View>

      {/* 첫 뷰포트 아래 — 상품·요금 안내와 사업자 정보(홈페이지 하단). */}
      <View style={[styles.publicInfo, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.publicInner}>
          <ProductShowcase onBuy={onBuy} />
          <CompanyInfoFooter />
        </View>
      </View>
    </ScrollView>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primary,
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  publicInfo: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  publicInner: {
    alignSelf: 'center',
    maxWidth: theme.maxContentWidth,
    width: '100%',
  },
  heroSection: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.md,
    // paddingTop 은 안전영역에 맞춰 런타임에 정한다.
    position: 'relative',
  },
  heroTitle: {
    color: colors.background,
    fontSize: 38,
    fontWeight: '900',
    lineHeight: 50,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: font.body,
    fontWeight: '600',
    lineHeight: font.body + 8,
    marginTop: spacing.sm,
  },
  features: {
    marginTop: spacing.lg + spacing.md,
  },
  featureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  featureCheck: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 32,
  },
  featureCheckText: {
    color: colors.background,
    fontSize: font.caption,
    fontWeight: '900',
  },
  featureText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: font.bodyLarge,
    fontWeight: '600',
  },
  logoWrap: {
    position: 'absolute',
    right: spacing.md,
    // top 은 안전영역에 맞춰 런타임에 정한다.
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 24,
    padding: spacing.xs,
  },
  logoImage: {
    width: 84,
    height: 84,
  },
  bottomSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.md,
    // paddingBottom 은 안전영역에 맞춰 런타임에 정한다.
    paddingTop: spacing.lg,
    position: 'relative',
  },
  speechBubble: {
    alignSelf: 'center',
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: -spacing.lg - spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  speechBubbleText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
    textAlign: 'center',
  },
  speechBubbleTail: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.border,
  },
  linksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  linkText: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
    paddingVertical: spacing.sm, // 18px 글자 + 위아래 16 → 터치 높이 48 이상
    paddingHorizontal: spacing.xs,
  },
  linkDivider: {
    color: colors.border,
    fontSize: font.body,
    marginHorizontal: spacing.xs / 2,
  },
});
