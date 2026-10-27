import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import brandmark from '../../../assets/brandmark.png';
import { theme } from '../../theme';

/**
 * 서비스 소개 블록 — 로고 · 한 줄 소개 · 이용 순서 3단계.
 * 첫 화면(Welcome)과 둘러보기(GuestHome)가 같은 내용을 보여 줘서 여기 한 번만 둔다.
 *
 * 문구는 실제 동작과 맞아야 한다(선결제 · 배차 전 전액 환불 · 건설폐기물만 — CLAUDE.md).
 */
const STEPS: ReadonlyArray<readonly [string, string]> = [
  ['현장 사진과 주소로 신청', '전국 어디든, 건설폐기물만 받습니다.'],
  ['업체 견적을 비교해서 선택', '사업자 확인을 마친 업체만 견적을 보냅니다.'],
  ['결제하면 배차·작업·인계서까지', '배차 전에 취소하면 전액 환불됩니다.'],
];

export function ServiceIntro({ onLogoLongPress }: { onLogoLongPress?: () => void }) {
  return (
    <View>
      <View style={styles.brandRow}>
        <Pressable
          accessibilityRole="image"
          accessibilityLabel="비움 로고"
          delayLongPress={1200}
          onLongPress={onLogoLongPress}
        >
          <Image source={brandmark} style={styles.logoImage} resizeMode="contain" />
        </Pressable>
        <Text style={styles.brandName}>비움</Text>
      </View>

      <Text style={styles.title}>{'철거하고 남은 폐기물,\n운반·처리까지 맡기세요'}</Text>
      <Text style={styles.subtitle}>
        철거업체·운반업체·처리장을 연결하고 올바로 전자인계서까지 처리합니다.
      </Text>

      <View style={styles.steps}>
        {STEPS.map(([title, desc], i) => (
          <View key={title} style={[styles.stepRow, i > 0 && styles.stepRowDivider]}>
            <Text style={styles.stepIndex}>{i + 1}</Text>
            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>{title}</Text>
              <Text style={styles.stepDesc}>{desc}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  logoImage: {
    height: 40,
    width: 40,
  },
  brandName: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    marginLeft: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: font.titleLarge + 4,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 28,
    marginTop: spacing.sm,
  },
  steps: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  stepRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
  },
  stepRowDivider: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  stepIndex: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    lineHeight: 28,
    width: spacing.md,
  },
  stepBody: {
    flex: 1,
  },
  stepTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    lineHeight: 28,
  },
  stepDesc: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 26,
  },
});
