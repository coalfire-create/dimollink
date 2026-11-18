import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { IconTile } from '../../components/ui';
import { AppIcon } from '../../components/AppIcon';
import { TABULAR_NUMS } from '../../lib/format';
import { theme } from '../../theme';

/**
 * 첫 화면 오른쪽의 "화면 예시" — 소비자가 실제로 보게 될 견적 비교 화면을 줄여 그린다.
 *
 * 그림·일러스트 대신 앱 화면 조각을 보여 주는 이유: 이 서비스가 무엇을 해 주는지
 * (견적이 여러 개 오고, 고르면 끝난다) 글보다 빨리 읽힌다. 큰 서비스 홈페이지들이 쓰는 방식.
 *
 * 업체 이름·금액은 **예시**다. 실제 업체처럼 보이지 않게 A·B·C 로 두고, 아래에
 * "화면 예시"라고 밝힌다. 누를 수 있는 것처럼 보이지 않게 버튼도 그림으로만 둔다.
 */
const SAMPLE_QUOTES: ReadonlyArray<{ mark: string; name: string; amount: string; best?: boolean }> = [
  { mark: 'A', name: 'A 철거', amount: '3,280,000원', best: true },
  { mark: 'B', name: 'B 해체공사', amount: '3,450,000원' },
  { mark: 'C', name: 'C 철거산업', amount: '3,610,000원' },
];

export function HeroPreview() {
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel="화면 예시: 철거 요청에 업체 견적 세 건이 도착한 모습"
    >
      <View style={styles.card}>
        <View style={styles.head}>
          <IconTile icon="hammer" size="sm" />
          <View style={styles.headText}>
            <Text style={styles.headTitle}>철거 요청</Text>
            <Text style={styles.headSub}>경기 양평군 · 연면적 120㎡</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>견적 3건</Text>
          </View>
        </View>

        {SAMPLE_QUOTES.map((q) => (
          <View key={q.mark} style={[styles.quote, q.best && styles.quoteBest]}>
            <IconTile label={q.mark} size="sm" tone={q.best ? 'solid' : 'brand'} />
            <View style={styles.quoteBody}>
              <Text style={styles.quoteName}>{q.name}</Text>
              <View style={styles.verified}>
                <AppIcon name="shield" size={18} color={colors.success} filled />
                <Text style={styles.verifiedText}>사업자 확인</Text>
              </View>
            </View>
            <Text style={[styles.amount, TABULAR_NUMS]}>{q.amount}</Text>
          </View>
        ))}

        <View style={styles.fakeButton}>
          <Text style={styles.fakeButtonText}>A 철거로 결정하기</Text>
        </View>
      </View>

      {/* 겹쳐 놓은 작은 카드 — 결제 뒤에 이어지는 일(인계서)까지 한 장면에 보여 준다. */}
      <View style={styles.floating}>
        <IconTile icon="document" size="sm" tone="solid" />
        <View>
          <Text style={styles.floatingTitle}>전자인계서 발행</Text>
          <Text style={styles.floatingSub}>올바로 연동</Text>
        </View>
      </View>

      <Text style={styles.caption}>화면 예시</Text>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: spacing.lg + spacing.md,
    width: 460,
  },
  card: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card + 4,
    borderWidth: 1,
    padding: spacing.md,
    ...theme.shadow.raised,
  },
  head: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  headText: { flex: 1 },
  headTitle: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '700' },
  headSub: { color: colors.textMuted, fontSize: font.caption },
  badge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.badge,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs / 2,
  },
  badgeText: { color: colors.primary, fontSize: font.caption, fontWeight: '700' },
  quote: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    padding: spacing.sm,
  },
  quoteBest: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  quoteBody: { flex: 1 },
  quoteName: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  verified: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs / 2 },
  verifiedText: { color: colors.success, fontSize: font.caption, fontWeight: '600' },
  amount: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '700' },
  fakeButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: theme.touch.minButtonHeight,
  },
  fakeButtonText: { color: colors.background, fontSize: font.body, fontWeight: '700' },
  floating: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    right: -spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
    ...theme.shadow.raised,
  },
  floatingTitle: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  floatingSub: { color: colors.textMuted, fontSize: font.caption },
  caption: {
    bottom: spacing.xs,
    color: colors.textMuted,
    fontSize: font.caption,
    left: spacing.xs,
    position: 'absolute',
  },
});
