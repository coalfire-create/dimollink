import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  REMOTE_SURVEY_ITEMS,
  REMOTE_SURVEY_MAX_OPEN_SHOT_REQUESTS_PER_PROVIDER,
} from '@dimol/shared';
import { Card, ErrorBanner, LoadingView } from '../../components/ui';
import { theme } from '../../theme';
import { ItemReviewCard } from './ItemReviewCard';
import { usePhotoReview } from './usePhotoReview';

/**
 * 사진 탭 — 체크리스트 순서(밖 → 안 → 세부 → 주변) 그대로, 업체가 현장에서 보는 순서다.
 * 빠진 항목은 빨간 테두리, 항목마다 "추가 촬영 요청"을 바로 보낼 수 있다.
 */
export function PhotosTab({ requestId }: { requestId: string }) {
  const review = usePhotoReview(requestId);

  if (review.loading) return <LoadingView />;
  if (!review.survey) {
    return (
      <View>
        <ErrorBanner message={review.error} onRetry={() => void review.reload()} />
        <Card>
          <Text style={styles.hint}>
            신청자가 아직 원격 실사 사진을 보내지 않았어요. 보내면 알림으로 알려 드려요.
          </Text>
        </Card>
      </View>
    );
  }

  const survey = review.survey;
  return (
    <View>
      <Card>
        <Text style={styles.limitTitle}>
          추가 촬영 요청 {review.openCount}/{REMOTE_SURVEY_MAX_OPEN_SHOT_REQUESTS_PER_PROVIDER}건
          기다리는 중
        </Text>
        <Text style={styles.hint}>
          신청자가 한 번에 감당할 수 있게 동시에 {REMOTE_SURVEY_MAX_OPEN_SHOT_REQUESTS_PER_PROVIDER}
          건까지만 보낼 수 있어요. 꼭 필요한 것부터 요청하세요.
        </Text>
      </Card>
      <ErrorBanner message={review.error} />

      {REMOTE_SURVEY_ITEMS.map((item) => (
        <ItemReviewCard
          key={item.id}
          item={item}
          survey={survey}
          requests={review.requests.filter((r) => r.itemId === item.id)}
          canRequestMore={review.canRequestMore}
          busy={review.busyItem === item.id}
          onRequestShot={(message) => review.requestShot(item.id, message)}
        />
      ))}
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  limitTitle: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800', marginBottom: spacing.xs },
  hint: { color: colors.textMuted, fontSize: font.body, lineHeight: 28 },
});
