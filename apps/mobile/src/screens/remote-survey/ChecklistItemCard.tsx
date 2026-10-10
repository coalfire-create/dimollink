import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  REMOTE_SURVEY_MAX_PHOTOS_PER_ITEM,
  isItemDone,
  isItemRequired,
  type RemoteSurvey,
  type RemoteSurveyItem,
} from '@dimol/shared';
import { AppButton, Card } from '../../components/ui';
import { ItemStatus } from './ItemStatus';
import { PhotoCaptureButton } from './PhotoCaptureButton';
import type { LocalPhoto } from './useRemoteSurvey';
import { theme } from '../../theme';

/**
 * 클로즈업 항목 하나(지붕·천장·바닥·벽 두께·진입로…) — 무엇을 찍는지, 몇 장 찍었는지, 찍기.
 */
export function ChecklistItemCard({
  item,
  survey,
  busy,
  onPhotos,
  onClear,
}: {
  item: RemoteSurveyItem;
  survey: RemoteSurvey;
  busy: boolean;
  onPhotos: (photos: LocalPhoto[]) => void;
  onClear: () => void;
}) {
  const count = survey.items[item.id]?.length ?? 0;
  const room = REMOTE_SURVEY_MAX_PHOTOS_PER_ITEM - count;
  return (
    <Card>
      <ItemStatus
        title={item.title}
        done={isItemDone(survey, item)}
        required={isItemRequired(item, survey.answers)}
      />
      <Text style={styles.instruction}>{item.instruction}</Text>
      <Text style={styles.count}>
        찍은 사진 {count}장{item.minPhotos > 1 ? ` (최소 ${item.minPhotos}장)` : ''}
      </Text>
      <View style={styles.actions}>
        <PhotoCaptureButton
          label={count > 0 ? '더 찍기' : '찍기'}
          maxPhotos={Math.max(1, room)}
          disabled={busy || room <= 0}
          onPhotos={onPhotos}
        />
        {count > 0 ? (
          <AppButton label="지우고 다시 찍기" variant="outline" disabled={busy} onPress={onClear} />
        ) : null}
      </View>
    </Card>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  instruction: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: 28,
    marginBottom: spacing.xs,
  },
  count: {
    color: colors.textMuted,
    fontSize: font.body,
    marginBottom: spacing.sm,
  },
  actions: {
    gap: spacing.xs,
  },
});
