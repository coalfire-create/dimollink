import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { RatingSummary } from '@dimol/shared';
import { getRating } from '../../api/client';
import { Card, InfoRow, SectionTitle } from '../../components/ui';
import { theme } from '../../theme';

/**
 * 업체 평점 — 평균과 리뷰 건수.
 *
 * 부가 정보라 조회에 실패해도 화면은 그대로 뜬다. 평가가 아직 없으면 0 을 보여주지
 * 않고 "아직 평가가 없어요"라고 쓴다 — 신규 업체가 0점으로 보이면 안 된다.
 */
export function RatingCards({ userId }: { userId: string }) {
  const [rating, setRating] = useState<RatingSummary | null>(null);

  useEffect(() => {
    getRating(userId)
      .then(setRating)
      .catch(() => setRating(null));
  }, [userId]);

  return (
    <>
      <SectionTitle>평가</SectionTitle>
      {rating && rating.average !== null ? (
        <View style={styles.row}>
          <View style={styles.card}>
            <Text style={styles.number}>{rating.average}</Text>
            <Text style={styles.label}>평균 평점</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.number}>{rating.reviewCount}</Text>
            <Text style={styles.label}>리뷰 건수</Text>
          </View>
        </View>
      ) : (
        <Card>
          <InfoRow label="평균 평점" value="아직 평가가 없어요" />
        </Card>
      )}
    </>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.card,
    flex: 1,
    paddingVertical: spacing.md,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  number: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
  label: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
  },
});
