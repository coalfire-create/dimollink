import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  REMOTE_SURVEY_MAX_ROOMS,
  REMOTE_SURVEY_ROOM_NAME_MAX,
  REQUIRED_ROOM_SLOTS,
  isItemDone,
  isRoomComplete,
  type RemoteSurvey,
  type RemoteSurveyItem,
  type RemoteSurveyRoom,
} from '@dimol/shared';
import { AppButton, Card, Field } from '../../components/ui';
import {
  GuidedSiteCaptureModal,
  type GuidedCaptureResult,
} from '../../components/GuidedSiteCaptureModal';
import { ItemStatus } from './ItemStatus';
import { theme } from '../../theme';

/** 자주 쓰는 방 이름 — 눌러서 바로 넣는다(글자 입력이 어려운 사용자를 위해). */
const ROOM_PRESETS = ['거실', '안방', '작은방', '주방', '화장실', '계단실'] as const;

/**
 * 방마다 안쪽 — 방 이름을 넣고, 방마다 가이드 촬영(벽 4면·바닥·천장)을 한 바퀴 돈다.
 *
 * 가이드 촬영은 기존 [[GuidedSiteCaptureModal]] 을 그대로 쓴다. 한 바퀴 결과로 그 방의
 * 사진을 통째로 바꾼다 — "다시 찍기"가 곧 덮어쓰기라 섞이지 않는다.
 */
export function RoomsCard({
  item,
  survey,
  busy,
  onAddRoom,
  onRemoveRoom,
  onRoomPhotos,
}: {
  item: RemoteSurveyItem;
  survey: RemoteSurvey;
  busy: boolean;
  onAddRoom: (name: string) => void;
  onRemoveRoom: (roomId: string) => void;
  onRoomPhotos: (roomId: string, photos: GuidedCaptureResult[]) => void;
}) {
  const [name, setName] = useState('');
  const [capturingRoomId, setCapturingRoomId] = useState<string | null>(null);
  const full = survey.rooms.length >= REMOTE_SURVEY_MAX_ROOMS;
  const used = new Set(survey.rooms.map((r) => r.name));

  const add = (roomName: string) => {
    const trimmed = roomName.trim();
    if (!trimmed || full) return;
    onAddRoom(trimmed);
    setName('');
  };

  return (
    <Card>
      <ItemStatus title={item.title} done={isItemDone(survey, item)} required />
      <Text style={styles.instruction}>{item.instruction}</Text>

      {survey.rooms.map((room) => (
        <RoomRow
          key={room.id}
          room={room}
          busy={busy}
          onCapture={() => setCapturingRoomId(room.id)}
          onRemove={() => onRemoveRoom(room.id)}
        />
      ))}

      {full ? (
        <Text style={styles.muted}>방은 {REMOTE_SURVEY_MAX_ROOMS}개까지 넣을 수 있어요.</Text>
      ) : (
        <>
          <Text style={styles.label}>방 넣기</Text>
          <View style={styles.presets}>
            {ROOM_PRESETS.filter((preset) => !used.has(preset)).map((preset) => (
              <Pressable
                key={preset}
                accessibilityRole="button"
                accessibilityLabel={`${preset} 넣기`}
                disabled={busy}
                onPress={() => add(preset)}
                style={styles.preset}
              >
                <Text style={styles.presetText}>+ {preset}</Text>
              </Pressable>
            ))}
          </View>
          <Field
            label="다른 이름으로 넣기"
            placeholder="예: 2층 방"
            value={name}
            maxLength={REMOTE_SURVEY_ROOM_NAME_MAX}
            onChangeText={setName}
            returnKeyType="done"
            onSubmitEditing={() => add(name)}
          />
          <AppButton
            label="이 이름으로 넣기"
            variant="outline"
            disabled={busy || !name.trim()}
            onPress={() => add(name)}
          />
        </>
      )}

      <GuidedSiteCaptureModal
        visible={capturingRoomId !== null}
        onClose={() => setCapturingRoomId(null)}
        onComplete={(photos) => {
          const roomId = capturingRoomId;
          setCapturingRoomId(null);
          if (roomId) onRoomPhotos(roomId, photos);
        }}
      />
    </Card>
  );
}

function RoomRow({
  room,
  busy,
  onCapture,
  onRemove,
}: {
  room: RemoteSurveyRoom;
  busy: boolean;
  onCapture: () => void;
  onRemove: () => void;
}) {
  const done = isRoomComplete(room);
  const filled = REQUIRED_ROOM_SLOTS.filter((s) => (room.photoKeys[s]?.length ?? 0) > 0).length;
  return (
    <View style={styles.room}>
      <Text style={styles.roomName}>
        {done ? '✓ ' : ''}
        {room.name}
      </Text>
      <Text style={styles.muted}>
        {done ? '다 찍었어요' : `${filled} / ${REQUIRED_ROOM_SLOTS.length} 찍음`}
      </Text>
      <View style={styles.roomActions}>
        <AppButton
          label={done ? '다시 찍기' : '이 방 찍기'}
          variant={done ? 'outline' : 'primary'}
          disabled={busy}
          onPress={onCapture}
        />
        <AppButton label="방 빼기" variant="outline" disabled={busy} onPress={onRemove} />
      </View>
    </View>
  );
}

const { colors, font, spacing, radius, touch } = theme;

const styles = StyleSheet.create({
  instruction: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: 28,
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  muted: {
    color: colors.textMuted,
    fontSize: font.body,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  preset: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: touch.minButtonHeight,
    paddingHorizontal: spacing.sm,
  },
  presetText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  room: {
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  roomName: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  roomActions: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
