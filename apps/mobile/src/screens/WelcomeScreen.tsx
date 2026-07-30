import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { theme } from '../theme';
import brandmark from '../../assets/brandmark.png';

/**
 * 진입 게이트 — 앱을 열면 가장 먼저 보이는 화면.
 * 레퍼런스 디자인(007~009.png): 파란 전면 배경 + 대형 타이포 + 소파 일러스트 + 하단 흰 시트.
 * 로그인 / 회원가입으로만 서비스에 들어갈 수 있고, 둘러보기(게스트)는 별도 경로.
 */
export function WelcomeScreen({
  onLogin,
  onSignup,
  onGuest,
  onAdmin,
}: {
  onLogin: () => void;
  onSignup: () => void;
  onGuest: () => void;
  onAdmin?: () => void;
}) {
  return (
    <View style={styles.container}>
      {/* 상단: 파란색 배경 + 타이포 + 소파 일러스트 */}
      <View style={styles.heroSection}>
        <FadeInUp delay={40}>
          <Text style={styles.heroTitle}>
            {'철거부터\n처리까지\n비움'}
          </Text>
        </FadeInUp>
        <FadeInUp delay={160}>
          <Text style={styles.heroSubtitle}>
            {'건설폐기물 전국 매칭 플랫폼\n올바로 전자인계서 자동화'}
          </Text>
        </FadeInUp>

        {/* 비움 로고 */}
        <FadeInUp delay={280}>
          <View style={styles.logoWrap}>
            <Image
              source={brandmark}
              style={styles.logoImage}
              resizeMode="contain"
              accessibilityLabel="비움 로고"
            />
          </View>
        </FadeInUp>
      </View>

      {/* 하단: 흰색 라운드 시트 */}
      <View style={styles.bottomSheet}>
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
            <Pressable onPress={onGuest}>
              <Text style={styles.linkText}>로그인 없이 둘러보기</Text>
            </Pressable>
            {onAdmin ? (
              <>
                <Text style={styles.linkDivider}>|</Text>
                <Pressable onPress={onAdmin}>
                  <Text style={styles.linkText}>관리자</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </FadeInUp>
      </View>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primary,
    flex: 1,
  },
  heroSection: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg + spacing.md,
    justifyContent: 'flex-start',
    position: 'relative',
  },
  heroTitle: {
    color: '#FFFFFF',
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
  logoWrap: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 28,
    padding: spacing.sm,
  },
  logoImage: {
    width: 120,
    height: 120,
  },
  bottomSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg + spacing.sm,
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
    shadowColor: '#000',
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
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  linkDivider: {
    color: colors.border,
    fontSize: font.body,
    marginHorizontal: spacing.xs / 2,
  },
});
