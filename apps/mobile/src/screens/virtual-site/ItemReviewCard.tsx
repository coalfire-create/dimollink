import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  isItemDone,
  isItemRequired,
  type RemoteSurvey,
  type RemoteSurveyItem,
  type RemoteSurveyShotRequest,
} from '@dimol/shared';
import { SitePhotoStrip } from '../../components/demolition/SitePhotoStrip';
import { Card } from '../../components/ui';
import { theme } from '../../theme';
import { RoomPhotos } from './RoomPhotos';
import { ShotRequestForm } from './ShotRequestForm';

/**
 * 체크리스트 항목 하나 — 무엇을 판단하는 항목인가(why) → 사진 → 내가 보낸 추가 촬영 요청.
 *
 * why 를 사진 위에 두는 이유: 업체가 사진을 "보는" 게 아니라 "무엇을 판단하려고 보는지"를
 * 알고 봐야 빠진 것을 알아챈다. 필수인데 빠진 항목은 테두리로 바로 보이게 한다.
 */
export function ItemReviewCard({
  item,
  survey,
  requests,
  canRequestMore,
  busy,
  onRequestShot,
}: {
  item: RemoteSurveyItem;
  survey: RemoteSurvey;
  /** 이 항목에 내가 보낸 요청(서버가 내 것만 준다). */
  requests: readonly RemoteSurveyShotRequest[];
  canRequestMore: boolean;
  busy: boolean;
  onRequestShot: (message: string) => Promise<boolean>;
}) {
  const required = isItemRequired(item, survey.answers);
  const done = isItemDone(survey, item);
  const keys = survey.items[item.id];
  const scanned = item.capture === 'SCAN_OR_PHOTOS' && Boolean(survey.scanJobId);

  return (
    <Card style={required && !done ? styles.missingCard : undefined}>
      <View style={styles.head}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={[styles.state, done ? styles.stateDone : required && styles.stateMissing]}>
          {done ? '받음' : required ? '빠짐' : '선택'}
        </Text>
      </View>
      <Text style={styles.why}>판단할 것 · {item.why}</Text>

      {item.capture === 'ROOMS' ? (
        <RoomPhotos rooms={survey.rooms} />
      ) : keys && keys.length > 0 ? (
        <SitePhotoStrip photoKeys={keys} title={null} />
      ) : (
        <Text style={styles.empty}>
          {scanned ? '사진 대신 3D 스캔을 보냈어요 — 3D·물량 탭에서 보세요.' : '사진이 없어요.'}
        </Text>
      )}

      {requests.map((r) => (
        <View key={r.id} style={styles.request}>
          <Text style={styles.requestState}>
            {r.status === 'OPEN' ? '내 요청 · 기다리는 중' : `내 요청 · 받음 ${r.photoKeys.length}장`}
          </Text>
          <Text style={styles.requestMessage}>“{r.message}”</Text>
          {r.photoKeys.length > 0 ? <SitePhotoStrip photoKeys={r.photoKeys} title={null} /> : null}
        </View>
      ))}

      <View style={styles.action}>
        <ShotRequestForm
          item={item}
          canRequestMore={canRequestMore}
          busy={busy}
          onSubmit={onRequestShot}
        />
      </View>
    </Card>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  missingCard: { borderColor: colors.error, borderWidth: 2 },
  head: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: colors.text, flex: 1, fontSize: font.bodyLarge, fontWeight: '800' },
  state: { color: colors.textMuted, fontSize: font.body, fontWeight: '800' },
  stateDone: { color: colors.primary },
  stateMissing: { color: colors.error },
  why: { color: colors.textMuted, fontSize: font.body, lineHeight: 28, marginVertical: spacing.xs },
  empty: { color: colors.textMuted, fontSize: font.body, marginBottom: spacing.xs },
  request: {
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    marginTop: spacing.xs,
    padding: spacing.sm,
  },
  requestState: { color: colors.primary, fontSize: font.body, fontWeight: '800' },
  requestMessage: { color: colors.text, fontSize: font.body, lineHeight: 28 },
  action: { marginTop: spacing.sm },
});
