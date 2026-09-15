import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { RatingSummary, UserProfile } from '@dimol/shared';
import { AppIcon } from '../../components/AppIcon';
import { Card, SectionTitle } from '../../components/ui';
import { theme } from '../../theme';

/**
 * 비움 협력 철거업체 — 사업자 검증과 승인을 마친 업체 목록.
 *
 * **평점은 실제 리뷰 집계가 있을 때만 그린다.** 없으면 자리 자체를 비운다 —
 * 신규 업체에 0점이나 지어낸 숫자를 붙이면 그 업체는 영영 일감을 못 받는다.
 * 인증 배지도 마찬가지로 실제로 등록된 것만 표시한다.
 */
export interface DemolitionPartner {
  id: string;
  name: string;
  region: string;
  rating: RatingSummary | null;
  allbaroCertified: boolean;
  insuranceRegistered: boolean;
  permitRegistered: boolean;
}

export function toPartner(user: UserProfile, rating: RatingSummary | null): DemolitionPartner {
  return {
    id: user.id,
    name: user.name,
    region: user.region ? `${user.region} 및 인근 지역` : '지역 미등록',
    rating,
    allbaroCertified: user.allbaroCertified,
    insuranceRegistered: user.insuranceRegistered,
    permitRegistered: user.permitRegistered,
  };
}

export function PartnerList({
  partners,
  loaded,
}: {
  partners: DemolitionPartner[];
  /** 아직 불러오는 중인지 — 비어 있는 이유가 다르면 문구도 달라야 한다. */
  loaded: boolean;
}) {
  return (
    <>
      <SectionTitle>비움 협력 철거업체</SectionTitle>
      <Text style={styles.subtitle}>사업자 검증과 승인을 마친 업체입니다</Text>

      {partners.length === 0 ? (
        <Card style={styles.noticeCard}>
          <Text style={styles.noticeText}>
            {loaded
              ? '아직 등록된 협력 업체가 없어요. 요청을 올리시면 담당자가 직접 업체를 연결해 드립니다.'
              : '협력 업체를 불러오는 중이에요.'}
          </Text>
        </Card>
      ) : (
        partners.map((partner) => <PartnerCard key={partner.id} partner={partner} />)
      )}
    </>
  );
}

function PartnerCard({ partner }: { partner: DemolitionPartner }) {
  const verifications = [
    partner.allbaroCertified ? '✓ 올바로 연동' : null,
    partner.insuranceRegistered ? '✓ 배상책임보험' : null,
    partner.permitRegistered ? '✓ 허가증 등록' : null,
  ].filter((item): item is string => item !== null);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.logo}>
          <AppIcon name="hammer" size={24} color={colors.primary} />
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>
            {partner.name}
          </Text>
          <Text style={styles.region} numberOfLines={1}>
            {partner.region}
          </Text>
        </View>
        {partner.rating && partner.rating.average !== null ? (
          <View
            accessibilityLabel={`평점 ${partner.rating.average}점, 리뷰 ${partner.rating.reviewCount}건`}
            style={styles.ratingBox}
          >
            <Text style={styles.ratingScore}>{partner.rating.average.toFixed(1)}</Text>
            <Text style={styles.ratingCount}>리뷰 {partner.rating.reviewCount}</Text>
          </View>
        ) : null}
      </View>

      {verifications.length > 0 ? (
        <View style={styles.verifyRow}>
          {verifications.map((item) => (
            <Text key={item} style={styles.verifyItem}>
              {item}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  subtitle: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginBottom: spacing.sm,
    marginTop: -spacing.xs,
  },
  noticeCard: {
    backgroundColor: colors.surface,
  },
  noticeText: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 26,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    marginBottom: spacing.sm,
    padding: spacing.md,
    ...theme.shadow.card,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  logo: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.badge,
    height: 48,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 48,
  },
  info: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  region: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
  },
  ratingBox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    marginLeft: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  ratingScore: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  ratingCount: {
    color: colors.textMuted,
    fontSize: font.caption,
  },
  verifyRow: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  verifyItem: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
});
