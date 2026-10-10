import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/ui';
import { theme } from '../../theme';
import { VideoSurveyCard } from '../request-detail/VideoSurveyCard';

/**
 * 영상통화 탭 — 사진으로 안 풀린 것을 "거기 비춰 주세요"로 본다.
 * 요청 상세의 영상통화 카드(시간 제안·입장·종료, [[useVideoSurvey]])를 그대로 쓴다.
 * 통화가 잡히면 견적의 실사가 원격(REMOTE)으로 기록된다(서버가 처리).
 */
export function VideoTab({ requestId }: { requestId: string }) {
  return (
    <View>
      <Card>
        <Text style={styles.hint}>
          사진으로 확인이 안 되는 곳(지하·벽 두께·전깃줄)은 영상통화로 신청자에게 비춰 달라고 하세요.
          통화는 녹화하지 않아요.
        </Text>
      </Card>
      <VideoSurveyCard requestId={requestId} isRequester={false} />
    </View>
  );
}

const { colors, font } = theme;

const styles = StyleSheet.create({
  hint: { color: colors.textMuted, fontSize: font.body, lineHeight: 28 },
});
