import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  REQUIRED_ROOM_SLOTS,
  SITE_CAPTURE_SLOTS,
  isRoomComplete,
  type RemoteSurveyRoom,
  type SiteCaptureSlotId,
} from '@dimol/shared';
import { SitePhotoStrip } from '../../components/demolition/SitePhotoStrip';
import { theme } from '../../theme';

/**
 * 촬영 위치 이름 — 업체 화면 표시용 짧은 말. 가이드 촬영 안내문(소비자용)은 길어서 쓰지 않는다.
 * 슬롯 순서는 [[site-capture-guide]] SITE_CAPTURE_SLOTS 를 그대로 따른다.
 */
const SLOT_NAMES: Record<SiteCaptureSlotId, string> = {
  FRONT_WALL: '정면 벽',
  RIGHT_WALL: '오른쪽 벽',
  BACK_WALL: '뒤쪽 벽',
  LEFT_WALL: '왼쪽 벽',
  FLOOR: '바닥',
  CEILING: '천장',
  DAMAGE: '손상 부위',
};

/** 방 하나 — 사진은 촬영 순서(벽 4면 → 바닥 → 천장 → 손상)대로 한 줄, 빠진 위치는 따로 적는다. */
function RoomRow({ room }: { room: RemoteSurveyRoom }) {
  // 사진 줄이 다시 불러오지 않도록 같은 방이면 같은 배열을 넘긴다.
  const keys = useMemo(
    () => SITE_CAPTURE_SLOTS.flatMap((slot) => room.photoKeys[slot.id] ?? []),
    [room],
  );
  const missing = REQUIRED_ROOM_SLOTS.filter((slot) => (room.photoKeys[slot]?.length ?? 0) === 0);

  return (
    <View style={styles.room}>
      <Text style={styles.roomName}>
        {room.name} · 사진 {keys.length}장
      </Text>
      {!isRoomComplete(room) ? (
        <Text style={styles.missing}>빠진 위치: {missing.map((s) => SLOT_NAMES[s]).join(', ')}</Text>
      ) : null}
      {keys.length > 0 ? <SitePhotoStrip photoKeys={keys} title={null} /> : null}
    </View>
  );
}

export function RoomPhotos({ rooms }: { rooms: readonly RemoteSurveyRoom[] }) {
  if (rooms.length === 0) return <Text style={styles.missing}>방 사진이 없어요.</Text>;
  return (
    <View>
      {rooms.map((room) => (
        <RoomRow key={room.id} room={room} />
      ))}
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  room: { marginTop: spacing.sm },
  roomName: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800' },
  missing: { color: colors.error, fontSize: font.body, fontWeight: '700', marginTop: spacing.xs },
});
