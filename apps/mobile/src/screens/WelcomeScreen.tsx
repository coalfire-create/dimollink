import React, { useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from '../components/ui';
import { CompanyInfoFooter } from '../components/CompanyInfoFooter';
import { FadeInUp } from '../components/motion';
import { ProductShowcase } from './store/ProductShowcase';
import { DevRoleShortcuts, type DevRoleKey } from './welcome/DevRoleShortcuts';
import { ServiceIntro } from './welcome/ServiceIntro';
import { theme } from '../theme';

/**
 * 진입 게이트 — 앱을 열면 가장 먼저 보이는 화면.
 * 흰 바탕에 로고·한 줄 소개·이용 순서 3단계, 아래에 로그인/회원가입 버튼.
 * 로그인 / 회원가입으로만 서비스에 들어갈 수 있고, 둘러보기(게스트)는 별도 경로.
 *
 * 첫 화면은 웹에서 곧 **홈페이지**다. PG(KG이니시스) 심사가 홈페이지에서 판매 상품과
 * 하단 사업자 정보(고객센터 전화 포함)를 확인하므로, 첫 뷰포트 아래로 상품 안내와 푸터를
 * 이어 붙인다. 첫 뷰포트(소개 + 버튼)는 화면 높이를 꽉 채워 그대로 둔다.
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
        {/* 상단: 로고 + 한 줄 소개 + 이용 순서. 흰 바탕에 글로 설명한다. */}
        <View style={[styles.heroSection, { paddingTop: insets.top + spacing.md }]}>
          <FadeInUp delay={40}>
            <ServiceIntro onLogoLongPress={onAdmin} />
          </FadeInUp>
        </View>

        {/* 하단 버튼 — 홈 인디케이터 위로 띄운다. */}
        <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
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
    backgroundColor: colors.background,
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
    paddingHorizontal: spacing.md,
    // paddingTop 은 안전영역에 맞춰 런타임에 정한다.
  },
  bottomSheet: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    // paddingBottom 은 안전영역에 맞춰 런타임에 정한다.
    paddingTop: spacing.md,
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
