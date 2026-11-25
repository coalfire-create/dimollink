import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CANCELLATION_PENALTY_RATE } from '@dimol/shared';
import { AppButton } from '../../components/ui';
import { useWideLayout } from '../../lib/layout';
import { theme } from '../../theme';

/** 섹션 머리 — 작은 파란 라벨 + 큰 제목 + (있으면) 한 줄 설명. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  center,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  center?: boolean;
}) {
  const wide = useWideLayout();
  const align = center ? styles.center : undefined;
  return (
    <View style={styles.heading}>
      {eyebrow ? <Text style={[styles.eyebrow, align]}>{eyebrow}</Text> : null}
      <Text accessibilityRole="header" style={[styles.title, wide && styles.titleWide, align]}>
        {title}
      </Text>
      {description ? <Text style={[styles.description, align]}>{description}</Text> : null}
    </View>
  );
}

/** 카드 여러 장 — 넓은 화면은 가로로, 좁은 화면은 세로로 쌓는다. */
function CardRow({ children }: { children: React.ReactNode }) {
  const wide = useWideLayout();
  return <View style={wide ? styles.rowWide : styles.rowNarrow}>{children}</View>;
}

function InfoCard({
  label,
  title,
  desc,
  tone = 'white',
}: {
  label?: string;
  title: string;
  desc: string;
  tone?: 'white' | 'grey';
}) {
  const wide = useWideLayout();
  return (
    <View style={[styles.card, tone === 'grey' && styles.cardGrey, wide && styles.cardWide]}>
      {label ? <Text style={styles.cardLabel}>{label}</Text> : null}
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardDesc}>{desc}</Text>
    </View>
  );
}

const STEPS = [
  { title: '현장 사진과 주소로 신청', desc: '사진 몇 장과 주소만 있으면 돼요.' },
  { title: '견적 비교 후 업체 선택', desc: '확인된 업체의 견적을 한눈에 비교해요.' },
  { title: '결제하면 나머지는 알아서', desc: '배차·작업·전자인계서까지 이어져요.' },
];

export function HowItWorks() {
  return (
    <View>
      <SectionHeading eyebrow="이용 방법" title="신청은 세 단계면 끝나요" />
      <CardRow>
        {STEPS.map((s, i) => (
          <InfoCard key={s.title} label={`${i + 1}단계`} title={s.title} desc={s.desc} />
        ))}
      </CardRow>
    </View>
  );
}

const FEATURES = [
  {
    title: '올바로 전자인계서 자동 발행',
    desc: '의무 대상이면 신청할 때 알려 드리고, 선택하면 자동으로 발행해요.',
  },
  { title: '확인된 업체만 견적', desc: '사업자등록 확인과 승인을 마친 업체만 참여해요.' },
  { title: '결제 전에 총 금액 확인', desc: '운반비·처리비·수수료 합계를 먼저 보여 드려요.' },
  {
    title: '배차 전 취소는 전액 환불',
    desc: `배차 후 작업 전 취소는 위약금 ${Math.round(CANCELLATION_PENALTY_RATE * 100)}%예요.`,
  },
];

export function Features() {
  const wide = useWideLayout();
  return (
    <View>
      <SectionHeading eyebrow="서비스 특징" title="처리까지 책임지는 중개" />
      <View style={wide ? styles.grid : styles.rowNarrow}>
        {FEATURES.map((f) => (
          <View key={f.title} style={wide ? styles.gridCell : undefined}>
            <InfoCard tone="grey" title={f.title} desc={f.desc} />
          </View>
        ))}
      </View>
    </View>
  );
}

const PARTNERS = [
  { title: '철거업체', desc: '근처 철거 요청을 받고 견적을 보내요.' },
  { title: '운반업체', desc: '콜대기를 켜 두면 주변 운반 콜이 들어와요.' },
  { title: '처리장', desc: '폐기물 반입 예약을 받고 일정을 관리해요.' },
];

export function PartnersSection({ onSignup }: { onSignup: () => void }) {
  return (
    <View>
      <SectionHeading
        eyebrow="업체 회원"
        title={'일감은 받고,\n정산은 다음 영업일에'}
        description="수수료를 뺀 금액을 다음 영업일에 보내 드려요."
      />
      <CardRow>
        {PARTNERS.map((p) => (
          <InfoCard key={p.title} title={p.title} desc={p.desc} />
        ))}
      </CardRow>
      <AppButton label="업체로 가입하기" onPress={onSignup} style={styles.partnerButton} />
    </View>
  );
}

/** 맨 아래 한 번 더 — 끝까지 읽은 사람이 위로 다시 올라가지 않게. */
export function ClosingCta({ onStart }: { onStart: () => void }) {
  return (
    <View style={styles.closing}>
      <SectionHeading center title="지금 바로 시작해 보세요" description="회원가입은 무료예요." />
      <AppButton label="무료로 시작하기" onPress={onStart} style={styles.closingButton} />
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  heading: { marginBottom: spacing.lg },
  center: { textAlign: 'center' },
  eyebrow: { color: colors.primary, fontSize: font.body, fontWeight: '700' },
  title: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
    letterSpacing: theme.tracking.title,
    lineHeight: 38,
    marginTop: spacing.xs,
  },
  titleWide: { fontSize: font.display + 4, letterSpacing: theme.tracking.display, lineHeight: 52 },
  description: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    lineHeight: 30,
    marginTop: spacing.xs,
  },
  rowWide: { flexDirection: 'row', gap: spacing.sm },
  rowNarrow: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridCell: { flexBasis: '48%', flexGrow: 1 },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  cardGrey: { backgroundColor: colors.appBackground },
  cardWide: { flex: 1 },
  cardLabel: { color: colors.primary, fontSize: font.body, fontWeight: '700', marginBottom: spacing.sm },
  cardTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '700',
    letterSpacing: theme.tracking.title,
    lineHeight: 32,
  },
  cardDesc: { color: colors.textMuted, fontSize: font.body, lineHeight: 28, marginTop: spacing.xs },
  partnerButton: { alignSelf: 'flex-start', marginTop: spacing.lg, minWidth: 220 },
  closing: { alignItems: 'center' },
  closingButton: { minWidth: 240 },
});
