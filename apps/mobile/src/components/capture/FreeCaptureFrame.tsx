import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

/**
 * 자유 촬영의 프레이밍 가이드.
 *
 * 가이드 촬영의 CaptureFrame 과 따로 두는 이유: 저쪽은 방향 정렬 여부에 따라 색이
 * 바뀌는 신호등이고, 이쪽은 "이 안에 담으세요"라는 안내선일 뿐이다. 역할이 달라서
 * 굵기·색·안내 문구가 다르다.
 */
export function FreeCaptureFrame() {
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.box}>
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />
        <Text style={styles.hint}>이 안에 현장을 맞춰 주세요</Text>
      </View>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    width: '82%',
    aspectRatio: 4 / 3,
    maxHeight: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: colors.background,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  hint: {
    color: colors.background,
    fontSize: font.body,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: 999,
    marginBottom: -14,
    overflow: 'hidden',
  },
});
