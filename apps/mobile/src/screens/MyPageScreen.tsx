import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  CALL_AVAILABILITY_LABELS,
  PILOT,
  USER_APPROVAL_LABELS,
  USER_TYPE_LABELS,
  isCompanyType,
  type RatingSummary,
} from '@dimol/shared';
import { getRating } from '../api/client';
import { AppButton, Card, InfoRow, SectionTitle } from '../components/ui';
import { ScreenHeader, TabBar, useAuthActions, useSession } from '../navigation';
import { theme } from '../theme';

/** 내 정보 — 프로필·승인 상태·올바로 인증 배지·평점 (Phase 1~2). */

export function MyPageScreen() {
  const user = useSession();
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
      <ScreenHeader title="내 정보" />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.role}>
            {USER_TYPE_LABELS[user.userType] ?? user.userType} · {PILOT.region}
          </Text>
          <View style={styles.badgeRow}>
            {user.allbaroCertified ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>✓ 올바로 인증 업체</Text>
              </View>
            ) : null}
            {user.insuranceRegistered ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>✓ 보험 가입</Text>
              </View>
            ) : null}
            {user.permitRegistered ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>✓ 허가증 등록</Text>
              </View>
            ) : null}
          </View>
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
            <Card>
              <InfoRow
                label="평균 평점"
                value={
                  rating && rating.average !== null
                    ? `★ ${rating.average} (${rating.reviewCount}건)`
                    : '아직 평가가 없어요'
                }
              />
            </Card>
          </>
        ) : null}

        <View style={{ height: theme.spacing.md }} />
        <AppButton label="로그아웃" variant="outline" onPress={logout} />

        <Text style={styles.footer}>디몰링크 · {PILOT.region} 파일럿</Text>
      </ScrollView>
      <TabBar active="mypage" />
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: spacing.sm,
    paddingBottom: spacing.lg,
  },
  name: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
  role: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.xs,
  },
  badge: {
    backgroundColor: '#E7F3EC',
    borderRadius: radius.badge,
    marginRight: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs / 2,
  },
  badgeText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  footer: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
