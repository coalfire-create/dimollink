import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import { HeroObject3D } from './three/HeroObject3D';

/**
 * 로그인·가입 화면(데스크톱 웹 좌우 분할) 왼쪽 패널.
 * 첫 화면과 같은 3D 오브젝트 하나 + 큰 문장 하나. 옅은 회색 바탕이라 오른쪽 흰 폼과 자연스럽게 나뉜다.
 */
export function AuthPanel({ mode }: { mode: 'login' | 'signup' }) {
  return (
    <View style={styles.root}>
      <View style={styles.copy}>
        <Text style={styles.headline}>
          {mode === 'login' ? '다시 오셨네요,\n반가워요' : '사진 한 장으로\n시작해 보세요'}
        </Text>
        <Text style={styles.sub}>
          {mode === 'login'
            ? '진행 중인 현장을 이어서 확인하세요.'
            : '확인된 업체 견적 비교부터 올바로 인계서까지.'}
        </Text>
      </View>
      {Platform.OS === 'web' ? <HeroObject3D style={styles.object} /> : null}
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.appBackground,
    flex: 1,
    justifyContent: 'center',
    minHeight: 640,
    overflow: 'hidden',
    padding: spacing.lg + spacing.sm,
  },
  copy: { maxWidth: 480 },
  headline: {
    color: colors.text,
    fontSize: font.display,
    fontWeight: '800',
    letterSpacing: theme.tracking.display,
    lineHeight: 48,
  },
  sub: { color: colors.textMuted, fontSize: font.bodyLarge, lineHeight: 30, marginTop: spacing.sm },
  object: { height: 400, marginTop: spacing.md, width: '100%' },
});
