import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from '../components/ui';
import { CompanyInfoFooter } from '../components/CompanyInfoFooter';
import { FadeInUp } from '../components/motion';
import { ProductShowcase } from './store/ProductShowcase';
import { ServiceIntro } from './welcome/ServiceIntro';
import { theme } from '../theme';

/**
 * 게스트(로그인 없이 둘러보기) 화면.
 * 서비스 소개만 제공하고, 요청 등록·내 정보 등 실제 기능은 로그인/회원가입으로 유도한다.
 * 판매 상품과 사업자 정보(고객센터 전화)도 여기서 볼 수 있다 — PG 심사 요건.
 */
export function GuestHomeScreen({
  onLogin,
  onSignup,
  onBuy,
}: {
  onLogin: () => void;
  onSignup: () => void;
  /** 상품 "구매하기" — 로그인 후 스토어로 이어진다. */
  onBuy: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      {/* 헤더가 없는 화면이라 콘텐츠가 그대로 상태바·홈 인디케이터에 붙는다. */}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + theme.spacing.md,
            paddingBottom: insets.bottom + theme.spacing.lg,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <FadeInUp delay={40}>
          <ServiceIntro />
        </FadeInUp>

        <View style={styles.publicInfo}>
          <ProductShowcase onBuy={onBuy} />
          <CompanyInfoFooter />
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <View style={styles.actionsInner}>
          <AppButton label="로그인" onPress={onLogin} />
          <View style={{ height: theme.spacing.xs }} />
          <AppButton label="회원가입" variant="outline" onPress={onSignup} />
        </View>
      </View>
    </View>
  );
}

const { colors, spacing } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    // 세로 여백은 안전영역에 맞춰 런타임에 정한다.
  },
  publicInfo: {
    marginTop: spacing.lg,
  },
  actions: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    elevation: 4,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  actionsInner: {
    padding: spacing.md,
  },
});
