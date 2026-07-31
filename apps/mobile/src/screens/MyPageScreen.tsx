import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import {
  CALL_AVAILABILITY_LABELS,
  USER_APPROVAL_LABELS,
  USER_TYPE_LABELS,
  isCompanyType,
  type RatingSummary,
} from '@dimol/shared';
import { getRating, WEB_BASE_URL } from '../api/client';
import { Card, InfoRow, SectionTitle } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, TabBar, useAuthActions, useNavigation, useSession } from '../navigation';
import { theme } from '../theme';

/** 내 정보 — 프로필·승인 상태·올바로 인증 배지·평점 (Phase 1~2). */

export function MyPageScreen() {
  const user = useSession();
  const nav = useNavigation();
  const { logout } = useAuthActions();
  const [rating, setRating] = useState<RatingSummary | null>(null);

  useEffect(() => {
    // 평점은 부가 정보 — 실패해도 화면은 뜬다.
    getRating(user.id)
      .then(setRating)
      .catch(() => setRating(null));
  }, [user.id]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="마이페이지" />

      {/* Hero profile section — sits above ScrollView for sticky feel */}
      <FadeInUp delay={40}>
        <View style={styles.heroSection}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user.name.trim().charAt(0) || '비'}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.name}>{user.name}</Text>
              <Text style={styles.role}>
                {USER_TYPE_LABELS[user.userType] ?? user.userType} · {user.region}
              </Text>
            </View>
          </View>
          {(user.allbaroCertified || user.insuranceRegistered || user.permitRegistered) ? (
            <View style={styles.badgeRow}>
              {user.allbaroCertified ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>✓ 올바로 인증</Text>
                </View>
              ) : null}
              {user.insuranceRegistered ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>✓ 보험 가입</Text>
                </View>
              ) : null}
              {user.permitRegistered ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>✓ 허가증</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </FadeInUp>

      <ScrollView contentContainerStyle={styles.content}>
        <SectionTitle>내 활동</SectionTitle>
        <Card style={styles.menuGroupCard}>
          <Pressable style={styles.menuItem} onPress={() => nav.switchTab('requests')}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconCircle}>
                <Text style={styles.menuIcon}>📋</Text>
              </View>
              <Text style={styles.menuLabel}>내 요청 목록</Text>
            </View>
            <Text style={styles.arrowIcon}>›</Text>
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable style={styles.menuItem} onPress={() => nav.switchTab('notifications')}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconCircle}>
                <Text style={styles.menuIcon}>🔔</Text>
              </View>
              <Text style={styles.menuLabel}>알림</Text>
            </View>
            <Text style={styles.arrowIcon}>›</Text>
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable style={styles.menuItem} onPress={() => nav.push({ name: 'siteAnalysis' })}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconCircle}>
                <Text style={styles.menuIcon}>📷</Text>
              </View>
              <Text style={styles.menuLabel}>현장 사진 분석</Text>
            </View>
            <Text style={styles.arrowIcon}>›</Text>
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable style={styles.menuItem} onPress={() => nav.push({ name: 'estimate' })}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconCircle}>
                <Text style={styles.menuIcon}>📐</Text>
              </View>
              <Text style={styles.menuLabel}>폐기물 양 계산</Text>
            </View>
            <Text style={styles.arrowIcon}>›</Text>
          </Pressable>
        </Card>

        <SectionTitle>계정</SectionTitle>
        <Card>
          <InfoRow label="가입 상태" value={USER_APPROVAL_LABELS[user.approvalStatus]} />
          {user.availability ? (
            <InfoRow label="콜대기" value={CALL_AVAILABILITY_LABELS[user.availability]} />
          ) : null}
          {user.phone ? <InfoRow label="연락처" value={user.phone} /> : null}
          <InfoRow label="가입일" value={new Date(user.createdAt).toLocaleDateString('ko-KR')} />
        </Card>

        {isCompanyType(user.userType) ? (
          <>
            <SectionTitle>평가</SectionTitle>
            {rating && rating.average !== null ? (
              <View style={styles.ratingRow}>
                <View style={styles.ratingCard}>
                  <Text style={styles.ratingNumber}>★ {rating.average}</Text>
                  <Text style={styles.ratingLabel}>평균 평점</Text>
                </View>
                <View style={styles.ratingCard}>
                  <Text style={styles.ratingNumber}>{rating.reviewCount}</Text>
                  <Text style={styles.ratingLabel}>리뷰 건수</Text>
                </View>
              </View>
            ) : (
              <Card>
                <InfoRow label="평균 평점" value="아직 평가가 없어요" />
              </Card>
            )}
          </>
        ) : null}

        <SectionTitle>지원</SectionTitle>
        <Card style={styles.menuGroupCard}>
          <Pressable
            style={styles.menuItem}
            onPress={() => Linking.openURL(`${WEB_BASE_URL}/terms`)}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconCircle}>
                <Text style={styles.menuIcon}>📄</Text>
              </View>
              <Text style={styles.menuLabel}>이용약관</Text>
            </View>
            <Text style={styles.arrowIcon}>›</Text>
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable
            style={styles.menuItem}
            onPress={() => Linking.openURL(`${WEB_BASE_URL}/privacy`)}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconCircle}>
                <Text style={styles.menuIcon}>🔒</Text>
              </View>
              <Text style={styles.menuLabel}>개인정보처리방침</Text>
            </View>
            <Text style={styles.arrowIcon}>›</Text>
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable
            style={styles.menuItem}
            onPress={() => Linking.openURL('mailto:coalfireant@gmail.com')}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconCircle}>
                <Text style={styles.menuIcon}>💬</Text>
              </View>
              <Text style={styles.menuLabel}>고객센터</Text>
            </View>
            <Text style={styles.arrowIcon}>›</Text>
          </Pressable>
        </Card>

        <View style={{ height: theme.spacing.lg }} />
        <Pressable onPress={logout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </Pressable>

        <Text style={styles.footer}>비움 v1.0.0 · 디몰링크 · 전국 건설폐기물</Text>
      </ScrollView>
      <TabBar active="mypage" />
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.surface,
    flex: 1,
  },
  heroSection: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    padding: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  profileRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 999,
    height: 72,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 72,
  },
  avatarText: {
    color: colors.primary,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
  profileInfo: {
    flex: 1,
  },
  name: {
    color: colors.background,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
  role: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.badge,
    marginRight: spacing.xs,
    marginTop: spacing.xs / 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  badgeText: {
    color: colors.background,
    fontSize: font.caption,
    fontWeight: '700',
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  menuGroupCard: {
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingVertical: spacing.xs,
    shadowColor: '#0B1B3A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuIconCircle: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 40,
  },
  menuIcon: {
    fontSize: font.body,
  },
  menuLabel: {
    fontSize: font.body,
    fontWeight: '700',
    color: colors.text,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  arrowIcon: {
    fontSize: font.titleLarge,
    color: colors.textMuted,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  ratingCard: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.card,
    flex: 1,
    paddingVertical: spacing.md,
    shadowColor: '#0B1B3A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  ratingNumber: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
  ratingLabel: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: 4,
  },
  logoutButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  logoutText: {
    color: colors.error,
    fontSize: font.body,
    fontWeight: '600',
  },
  footer: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
