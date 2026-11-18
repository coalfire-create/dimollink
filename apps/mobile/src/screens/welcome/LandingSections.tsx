import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton, IconTile } from '../../components/ui';
import type { IconName } from '../../components/AppIcon';
import { useWideLayout } from '../../lib/layout';
import { theme } from '../../theme';

/**
 * 로그인 전 홈페이지의 본문 섹션들 — 이용 방법 · 서비스 특징 · 업체 회원.
 *
 * 문구는 실제 동작과 정확히 맞아야 한다(CLAUDE.md 비즈니스 규칙): 건설폐기물만 · 전국 ·
 * 선결제 · 배차 전 전액 환불 / 배차 후 작업 전 위약금 10% · 수수료 뺀 금액 다음 영업일 정산.
 * 숫자로 자랑하는 문구(누적 건수 등)는 실제 집계가 없으므로 쓰지 않는다.
 */

/** 섹션 머리 — 작은 파란 머리말 + 큰 제목 + 설명. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  center,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  center?: boolean;
}) {
  const wide = useWideLayout();
  return (
    <View style={[styles.heading, center && styles.headingCenter]}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text
        accessibilityRole="header"
        style={[styles.title, wide && styles.titleWide, center && styles.textCenter]}
      >
        {title}
      </Text>
      {description ? (
        <Text style={[styles.description, center && styles.textCenter]}>{description}</Text>
      ) : null}
    </View>
  );
}

const STEPS: ReadonlyArray<{ icon: IconName; title: string; desc: string }> = [
  {
    icon: 'camera',
    title: '현장 사진과 주소로 신청',
    desc: '전국 어디든 지역을 직접 입력해 신청합니다. 건설폐기물만 받습니다.',
  },
  {
    icon: 'requests',
    title: '업체 견적을 비교해서 선택',
    desc: '사업자 확인을 마친 업체만 견적을 보냅니다. 금액을 비교하고 고르세요.',
  },
  {
    icon: 'truck',
    title: '결제하면 배차·작업·인계서까지',
    desc: '결제 후 배차와 작업이 진행되고, 전자인계서까지 이어서 처리됩니다.',
  },
];

/** 이용 방법 3단계 — 웹은 가로 3칸, 앱은 세로로 이어진 단계. */
export function HowItWorks() {
  const wide = useWideLayout();
  return (
    <View>
      <SectionHeading
        eyebrow="이용 방법"
        title="신청부터 처리까지 세 단계"
        description="현장에 업체를 여러 번 부르지 않아도 됩니다."
        center={wide}
      />
      <View style={wide ? styles.row3 : undefined}>
        {STEPS.map((step, i) => (
          <View key={step.title} style={[styles.stepCard, wide && styles.cellWide]}>
            <View style={styles.stepTop}>
              <IconTile icon={step.icon} />
              <Text style={styles.stepNumber}>{String(i + 1).padStart(2, '0')}</Text>
            </View>
            <Text style={styles.cardTitle}>{step.title}</Text>
            <Text style={styles.cardDesc}>{step.desc}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const FEATURES: ReadonlyArray<{ icon: IconName; title: string; desc: string }> = [
  {
    icon: 'document',
    title: '올바로 전자인계서',
    desc: '신고 의무 대상이면 신청 화면에서 알려 드리고, 선택하면 올바로 전자인계서를 발행합니다.',
  },
  {
    icon: 'shield',
    title: '확인된 업체만 견적',
    desc: '사업자 확인을 마친 철거·운반업체와 처리장만 견적을 보내고 일을 맡습니다.',
  },
  {
    icon: 'card',
    title: '결제 전 총 금액 안내',
    desc: '업체를 고르면 운반비·처리비·수수료를 합한 총 금액을 확인하고 결제합니다.',
  },
  {
    icon: 'lock',
    title: '배차 전 취소는 전액 환불',
    desc: '배차 전에 취소하면 전액 돌려드립니다. 배차 뒤 작업 전 취소는 위약금 10%가 있습니다.',
  },
];

/** 서비스 특징 — 웹은 2×2, 앱은 세로 목록. */
export function Features() {
  const wide = useWideLayout();
  return (
    <View>
      <SectionHeading
        eyebrow="서비스 특징"
        title="처리까지 책임지는 중개"
        description="폐기물은 버린 뒤가 더 중요합니다. 법정 서류까지 한 번에 챙깁니다."
        center={wide}
      />
      <View style={wide ? styles.row2 : undefined}>
        {FEATURES.map((f) => (
          <View key={f.title} style={[styles.featureCard, wide && styles.cellHalf]}>
            <IconTile icon={f.icon} tone="solid" />
            <View style={styles.featureBody}>
              <Text style={styles.cardTitle}>{f.title}</Text>
              <Text style={styles.cardDesc}>{f.desc}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const PARTNERS: ReadonlyArray<{ icon: IconName; title: string; desc: string }> = [
  { icon: 'hammer', title: '철거업체', desc: '근처 철거 요청을 받고 견적을 보냅니다.' },
  { icon: 'truck', title: '운반업체', desc: '콜대기를 켜 두면 주변 운반 콜이 들어옵니다.' },
  { icon: 'recycle', title: '처리장', desc: '폐기물 반입 예약을 받고 일정을 관리합니다.' },
];

/** 업체 회원 안내 — 먹색 띠 위에 역할 3칸 + 가입 버튼. */
export function PartnersSection({ onSignup }: { onSignup: () => void }) {
  const wide = useWideLayout();
  return (
    <View style={[styles.partners, wide && styles.partnersWide]}>
      <View style={wide ? styles.partnersHeadWide : undefined}>
        <Text style={styles.partnersEyebrow}>업체 회원</Text>
        <Text style={[styles.partnersTitle, wide && styles.titleWide]}>
          {'일감은 받고,\n정산은 다음 영업일에'}
        </Text>
        <Text style={styles.partnersDesc}>
          정산이 확정되면 수수료를 뺀 금액을 다음 영업일에 지급합니다(공휴일이면 그다음 영업일).
        </Text>
        <AppButton label="업체로 가입하기" onPress={onSignup} style={styles.partnersButton} />
      </View>
      <View style={wide ? styles.partnersList : undefined}>
        {PARTNERS.map((p) => (
          <View key={p.title} style={styles.partnerRow}>
            <IconTile icon={p.icon} tone="solid" />
            <View style={styles.featureBody}>
              <Text style={styles.partnerTitle}>{p.title}</Text>
              <Text style={styles.partnerDesc}>{p.desc}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  heading: { marginBottom: spacing.md },
  headingCenter: { alignItems: 'center', marginBottom: spacing.lg },
  eyebrow: { color: colors.primary, fontSize: font.body, fontWeight: '700' },
  title: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '700',
    letterSpacing: theme.tracking.title,
    lineHeight: 38,
    marginTop: spacing.xs,
  },
  titleWide: {
    fontSize: font.display,
    letterSpacing: theme.tracking.display,
    lineHeight: 48,
  },
  textCenter: { textAlign: 'center' },
  description: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 28,
    marginTop: spacing.xs,
  },
  row3: { flexDirection: 'row', gap: spacing.md },
  row2: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cellWide: { flex: 1, marginBottom: 0 },
  cellHalf: { flexBasis: '45%', flexGrow: 1, marginBottom: 0 },
  stepCard: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  stepTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  stepNumber: {
    color: colors.border,
    fontSize: font.display,
    fontWeight: '700',
    letterSpacing: theme.tracking.display,
  },
  cardTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    lineHeight: 28,
  },
  cardDesc: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 28,
    marginTop: spacing.xs / 2,
  },
  featureCard: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  featureBody: { flex: 1 },
  partners: {
    backgroundColor: colors.text,
    borderRadius: radius.card + 4,
    padding: spacing.md,
  },
  partnersWide: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg + spacing.lg,
    padding: spacing.lg + spacing.md,
  },
  partnersHeadWide: { flex: 1 },
  partnersEyebrow: { color: theme.onDark.textMuted, fontSize: font.body, fontWeight: '700' },
  partnersTitle: {
    color: colors.background,
    fontSize: font.titleLarge,
    fontWeight: '700',
    letterSpacing: theme.tracking.title,
    lineHeight: 38,
    marginTop: spacing.xs,
  },
  partnersDesc: {
    color: theme.onDark.text,
    fontSize: font.body,
    lineHeight: 28,
    marginTop: spacing.sm,
  },
  partnersButton: { alignSelf: 'flex-start', marginTop: spacing.md, minWidth: 220 },
  partnersList: { flex: 1 },
  partnerRow: {
    alignItems: 'center',
    borderTopColor: theme.onDark.divider,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  partnerTitle: { color: colors.background, fontSize: font.bodyLarge, fontWeight: '700' },
  partnerDesc: { color: theme.onDark.text, fontSize: font.body, lineHeight: 28 },
});
