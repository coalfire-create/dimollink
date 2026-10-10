import React from 'react';
import { StyleSheet, Text } from 'react-native';
import {
  REMOTE_SURVEY_MAX_PHOTOS_PER_ITEM,
  remoteSurveyItem,
  type RemoteSurveyShotRequest,
} from '@dimol/shared';
import { Card, SectionTitle } from '../../components/ui';
import { PhotoCaptureButton } from './PhotoCaptureButton';
import type { LocalPhoto } from './useRemoteSurvey';
import { theme } from '../../theme';

/**
 * 추가 촬영 요청 — 업체가 "이것 더 찍어 주세요" 한 것. 현장에서 "저기 좀 보여주세요"를 대신한다.
 * 아직 안 보낸 것을 위에, 보낸 것은 아래에 짧게 둔다.
 */
export function ShotRequestList({
  requests,
  busy,
  onFulfil,
}: {
  requests: readonly RemoteSurveyShotRequest[];
  busy: boolean;
  onFulfil: (shotRequestId: string, photos: LocalPhoto[]) => void;
}) {
  if (requests.length === 0) return null;
  const open = requests.filter((r) => r.status === 'OPEN');
  const done = requests.filter((r) => r.status === 'FULFILLED');

  return (
    <>
      <SectionTitle>추가 촬영 요청 {open.length > 0 ? `${open.length}건` : ''}</SectionTitle>
      {open.map((row) => {
        const item = row.itemId ? remoteSurveyItem(row.itemId) : undefined;
        return (
          <Card key={row.id} style={styles.openCard}>
            {item ? <Text style={styles.item}>{item.title}</Text> : null}
            <Text style={styles.message}>“{row.message}”</Text>
            <PhotoCaptureButton
              label="찍어서 보내기"
              maxPhotos={REMOTE_SURVEY_MAX_PHOTOS_PER_ITEM}
              disabled={busy}
              onPhotos={(photos) => onFulfil(row.id, photos)}
            />
          </Card>
        );
      })}
      {done.map((row) => (
        <Card key={row.id}>
          <Text style={styles.done}>✓ 보냈어요 · 사진 {row.photoKeys.length}장</Text>
          <Text style={styles.doneMessage}>{row.message}</Text>
        </Card>
      ))}
    </>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  openCard: {
    borderColor: colors.primary,
  },
  item: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  message: {
    color: colors.text,
    fontSize: font.bodyLarge,
    lineHeight: 30,
    marginBottom: spacing.sm,
  },
  done: {
    color: colors.success,
    fontSize: font.body,
    fontWeight: '700',
  },
  doneMessage: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
});
