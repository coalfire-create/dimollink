import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  VIDEO_SURVEY_COPY,
  canJoinVideoSurvey,
  videoSurveyJoinWindow,
  type VideoSurveySession,
} from '@dimol/shared';
import { AppButton, Card, ErrorBanner, SectionTitle } from '../../components/ui';
import { theme } from '../../theme';
import { VideoSurveyProposeForm } from './VideoSurveyProposeForm';
import { useVideoSurvey } from './useVideoSurvey';

/**
 * 영상통화 실사 — 업체가 현장에 오지 않고 "거기 비춰 주세요"로 본다.
 *
 * 요청자: 제안된 시간 고르기 → 입장 시간에 참여. 업체: 시간 제안 → 참여 → 종료.
 * 녹화하지 않는다는 안내는 항상 보인다(현장 영상에는 집 안이 그대로 담긴다).
 * 서버가 목 공급자면 '테스트 모드'를 띄운다 — 연결되지 않는 통화를 진짜처럼 보이면 안 된다.
 */
export function VideoSurveyCard({
  requestId,
  isRequester,
}: {
  requestId: string;
  isRequester: boolean;
}) {
  const v = useVideoSurvey(requestId, isRequester);
  // 업체인데 걸 수도 없고 기록도 없으면 이 카드를 보여줄 이유가 없다.
  if (!isRequester && !v.canPropose && v.sessions.length === 0) return null;
  // 요청자는 업체가 먼저 요청해야 할 일이 생긴다.
  if (isRequester && v.sessions.length === 0) return null;

  return (
    <>
      <SectionTitle>{VIDEO_SURVEY_COPY.title}</SectionTitle>
      <Card>
        {v.testMode ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{VIDEO_SURVEY_COPY.testMode}</Text>
          </View>
        ) : null}
        <Text style={styles.hint}>{VIDEO_SURVEY_COPY.intro}</Text>
        <Text style={styles.privacy}>{VIDEO_SURVEY_COPY.noRecording}</Text>

        {v.sessions.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            isRequester={isRequester}
            now={v.now}
            busy={v.busyId === s.id}
            onAccept={(at) => void v.accept(s.id, at)}
            onJoin={() => void v.join(s.id)}
            onEnd={() => void v.end(s.id)}
            onCancel={() => void v.cancel(s.id)}
          />
        ))}

        {!isRequester && v.canPropose ? (
          <VideoSurveyProposeForm
            busy={v.busyId === 'new'}
            onSubmit={(times) => void v.propose(times)}
            onInvalid={v.setError}
          />
        ) : null}

        {v.info ? <Text style={styles.info}>{v.info}</Text> : null}
        <ErrorBanner message={v.error} />
      </Card>
    </>
  );
}

function SessionRow({
  session: s,
  isRequester,
  now,
  busy,
  onAccept,
  onJoin,
  onEnd,
  onCancel,
}: {
  session: VideoSurveySession;
  isRequester: boolean;
  now: Date;
  busy: boolean;
  onAccept: (at: string) => void;
  onJoin: () => void;
  onEnd: () => void;
  onCancel: () => void;
}) {
  const when = (iso: string) => new Date(iso).toLocaleString('ko-KR');
  const joinable = canJoinVideoSurvey(s, now);
  const who = isRequester ? (s.providerName ?? '철거업체') : '현장';

  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>
        {who} · {VIDEO_SURVEY_COPY.status[s.status]}
      </Text>

      {s.status === 'REQUESTED' && isRequester ? (
        <>
          <Text style={styles.hint}>{VIDEO_SURVEY_COPY.pickTime}</Text>
          {(s.proposedAt ?? []).map((t) => (
            <AppButton key={t} label={when(t)} variant="outline" loading={busy} onPress={() => onAccept(t)} />
          ))}
        </>
      ) : null}
      {s.status === 'REQUESTED' && !isRequester ? (
        <Text style={styles.hint}>요청하신 분이 시간을 고르면 알려 드려요.</Text>
      ) : null}

      {s.scheduledAt && (s.status === 'SCHEDULED' || s.status === 'LIVE') ? (
        <>
          <Text style={styles.when}>{when(s.scheduledAt)}</Text>
          {!joinable ? (
            <Text style={styles.hint}>
              {VIDEO_SURVEY_COPY.notYet(videoSurveyJoinWindow(s.scheduledAt).opensAt)}
            </Text>
          ) : null}
          <AppButton
            label={VIDEO_SURVEY_COPY.join}
            disabled={!joinable}
            loading={busy}
            onPress={onJoin}
          />
        </>
      ) : null}

      {s.status === 'LIVE' ? (
        <AppButton label={VIDEO_SURVEY_COPY.end} variant="outline" loading={busy} onPress={onEnd} />
      ) : null}
      {s.status === 'REQUESTED' || s.status === 'SCHEDULED' ? (
        <AppButton label={VIDEO_SURVEY_COPY.cancel} variant="outline" loading={busy} onPress={onCancel} />
      ) : null}
      {s.status === 'ENDED' && s.durationSec !== undefined ? (
        <Text style={styles.hint}>통화 {Math.max(1, Math.round(s.durationSec / 60))}분</Text>
      ) : null}
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: theme.radius.badge,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeText: { color: colors.primary, fontSize: font.body, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: font.body, lineHeight: font.body * 1.5 },
  privacy: { color: colors.text, fontSize: font.body, fontWeight: '700', marginTop: spacing.xs },
  info: { color: colors.primary, fontSize: font.body, fontWeight: '700', marginTop: spacing.sm },
  row: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  rowTitle: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800' },
  when: { color: colors.primary, fontSize: font.bodyLarge, fontWeight: '700' },
});
