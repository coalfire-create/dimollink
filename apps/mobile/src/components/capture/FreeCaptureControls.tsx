import React from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppIcon } from '../AppIcon';
import { theme } from '../../theme';
import type { CapturedPhoto } from '../CameraCaptureModal';

/**
 * 자유 촬영 하단 — 찍은 사진 스트립 + 전환·셔터·완료.
 *
 * 찍은 사진을 바로 아래에 늘어놓고 각각 지울 수 있게 한다. 현장에서 여러 장을
 * 연달아 찍다 보면 흔들린 컷이 섞이는데, 나중에 분석 결과를 보고 되짚는 것보다
 * 그 자리에서 지우는 편이 훨씬 빠르다.
 */
export function FreeCaptureControls({
  photos,
  capturing,
  reachedMax,
  maxPhotos,
  onRemove,
  onFlip,
  onShutter,
  onDone,
}: {
  photos: CapturedPhoto[];
  capturing: boolean;
  reachedMax: boolean;
  maxPhotos: number;
  onRemove: (index: number) => void;
  onFlip: () => void;
  onShutter: () => void;
  onDone: () => void;
}) {
  return (
    <View style={styles.bottomArea} pointerEvents="box-none">
      {photos.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.thumbStrip}
          contentContainerStyle={styles.thumbStripContent}
        >
          {photos.map((photo, index) => (
            <View key={photo.uri} style={styles.thumbWrap}>
              <Image source={{ uri: photo.uri }} style={styles.thumb} />
              <Pressable
                style={styles.thumbRemove}
                onPress={() => onRemove(index)}
                accessibilityRole="button"
                accessibilityLabel={`${index + 1}번째 사진 삭제`}
              >
                <Text style={styles.thumbRemoveText}>✕</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.bottomBar}>
        <Pressable
          style={styles.flipBtn}
          onPress={onFlip}
          accessibilityRole="button"
          accessibilityLabel="카메라 전환"
        >
          <AppIcon name="recycle" size={24} color={colors.background} />
        </Pressable>

        <Pressable
          style={[styles.shutterOuter, reachedMax && styles.shutterDisabled]}
          onPress={onShutter}
          disabled={capturing || reachedMax}
          accessibilityRole="button"
          accessibilityLabel="사진 촬영"
          accessibilityState={{ disabled: capturing || reachedMax }}
        >
          {capturing ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <View style={styles.shutterInner} />
          )}
        </Pressable>

        <Pressable
          style={[styles.doneBtn, photos.length === 0 && styles.doneBtnDisabled]}
          onPress={onDone}
          disabled={photos.length === 0}
          accessibilityRole="button"
          accessibilityLabel="촬영 완료"
        >
          <Text style={styles.doneBtnText}>완료</Text>
          <Text style={styles.doneBtnCount}>{photos.length}장</Text>
        </Pressable>
      </View>

      {reachedMax ? (
        <Text style={styles.maxHint}>최대 {maxPhotos}장까지 촬영할 수 있어요</Text>
      ) : null}
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  bottomArea: {
    paddingBottom: Platform.OS === 'web' ? spacing.md : 32,
  },
  thumbStrip: {
    maxHeight: 76,
    marginBottom: spacing.xs,
  },
  thumbStripContent: {
    paddingHorizontal: spacing.md,
    gap: 8,
  },
  thumbWrap: {
    position: 'relative',
  },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(220,38,38,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemoveText: {
    color: colors.background,
    fontSize: theme.glyph.small,
    fontWeight: '800',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  flipBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 5,
    borderColor: colors.background,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: {
    opacity: 0.4,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background,
  },
  doneBtn: {
    minWidth: 56,
    height: 56,
    borderRadius: 28,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnDisabled: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  doneBtnText: {
    color: colors.background,
    fontSize: font.body,
    fontWeight: '800',
  },
  doneBtnCount: {
    color: colors.primarySoft,
    fontSize: font.caption,
    fontWeight: '700',
  },
  maxHint: {
    color: colors.errorOnDark,
    fontSize: font.caption,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
