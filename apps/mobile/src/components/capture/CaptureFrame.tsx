import React from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../../theme';

/**
 * 화면 중앙 프레이밍 가이드 — 네 모서리 표시.
 *
 * 색이 곧 상태다: 방향이 맞으면 초록 계열, 어긋나면 경고색. 사용자가 뷰파인더에서
 * 눈을 떼지 않고도 지금 찍어도 되는지 알 수 있어야 한다.
 */
export function CaptureFrame({ aligned }: { aligned: boolean }) {
  const cornerTone = aligned ? styles.cornerOk : styles.cornerWarn;
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={[styles.box, aligned ? styles.boxOk : styles.boxWarn]}>
        <View style={[styles.corner, styles.cornerTL, cornerTone]} />
        <View style={[styles.corner, styles.cornerTR, cornerTone]} />
        <View style={[styles.corner, styles.cornerBL, cornerTone]} />
        <View style={[styles.corner, styles.cornerBR, cornerTone]} />
      </View>
    </View>
  );
}

const { colors } = theme;

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  box: {
    width: '82%',
    aspectRatio: 4 / 3,
    maxHeight: '100%',
  },
  boxOk: {},
  boxWarn: {},
  corner: { position: 'absolute', width: 36, height: 36 },
  cornerOk: { borderColor: colors.successOnDark },
  cornerWarn: { borderColor: colors.warningOnDark },
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
});
