import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import editorialSite from '../../assets/editorial-site.png';
import { theme } from '../theme';

const FACTS = [
  '전국 현장 접수 · 사업자 확인 업체 매칭',
  '올바로 전자인계서 자동 발행',
  '배차 전 취소 전액 환불 · 정산은 다음 영업일',
] as const;

/**
 * 로그인·가입 화면(데스크톱 웹 좌우 분할) 왼쪽 패널.
 * 움직이는 장식 없이 현장 사진 위에 문구만 얹는다 — 사진은 먹색으로 눌러 글자 대비를 확보.
 */
export function AuthPanel({ mode }: { mode: 'login' | 'signup' }) {
  return (
    <View style={styles.root}>
      <Image source={editorialSite} style={styles.photo} resizeMode="cover" />
      <View style={styles.shade} />
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>
          {mode === 'login' ? '건설폐기물 · 철거 중개' : '전국 현장 · 업체 가입'}
        </Text>
        <Text style={styles.headline}>
          {mode === 'login'
            ? '철거 현장과 확인된 업체를\n한 곳에서 잇습니다'
            : '견적 비교부터\n올바로 인계서까지'}
        </Text>
        <View style={styles.facts}>
          {FACTS.map((text) => (
            <Text key={text} style={styles.fact}>
              {text}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const { colors, font, spacing, onDark } = theme;

const styles = StyleSheet.create({
  root: { backgroundColor: onDark.canvas, flex: 1, justifyContent: 'flex-end', minHeight: 640, overflow: 'hidden' },
  photo: { ...StyleSheet.absoluteFillObject, height: '100%', width: '100%' },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: onDark.canvas, opacity: 0.72 },
  copy: { maxWidth: 460, padding: spacing.lg + spacing.sm },
  eyebrow: { color: onDark.textMuted, fontSize: font.caption, fontWeight: '700', marginBottom: spacing.xs },
  headline: {
    color: colors.background,
    fontSize: font.titleLarge,
    fontWeight: '700',
    letterSpacing: theme.tracking.title,
    lineHeight: 40,
    marginBottom: spacing.lg,
  },
  facts: { borderTopColor: onDark.border, borderTopWidth: 1 },
  fact: {
    borderBottomColor: onDark.border,
    borderBottomWidth: 1,
    color: onDark.text,
    fontSize: font.caption,
    fontWeight: '500',
    paddingVertical: spacing.xs,
  },
});
