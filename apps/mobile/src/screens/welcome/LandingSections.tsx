import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { CANCELLATION_PENALTY_RATE } from '@dimol/shared';
import editorialLogistics from '../../../assets/editorial-logistics.png';
import editorialPlant from '../../../assets/editorial-plant.png';
import editorialSite from '../../../assets/editorial-site.png';
import { AppButton } from '../../components/ui';
import { TABULAR_NUMS } from '../../lib/format';
import { useWideLayout } from '../../lib/layout';
import { theme } from '../../theme';

/** 섹션 머리 — 모노 인덱스 태그 + 큰 제목 + 설명. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  dark,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  dark?: boolean;
}) {
  const wide = useWideLayout();
  return (
    <View style={styles.heading}>
      <Text style={[styles.eyebrow, dark && styles.eyebrowDark]}>{eyebrow}</Text>
      <Text
        accessibilityRole="header"
        style={[styles.title, wide && styles.titleWide, dark && styles.titleDark]}
      >
        {title}
      </Text>
      {description ? (
        <Text style={[styles.description, dark && styles.descriptionDark]}>{description}</Text>
      ) : null}
    </View>
  );
}

const STEPS: ReadonlyArray<{
  code: string;
  title: string;
  desc: string;
  image: ImageSourcePropType;
}> = [
  {
    code: '01',
    title: '현장 사진과 주소로 신청',
    desc: '지역을 직접 입력해 신청합니다.',
    image: editorialSite,
  },
  {
    code: '02',
    title: '업체 견적을 비교해서 선택',
    desc: '확인된 업체의 견적을 비교합니다.',
    image: editorialLogistics,
  },
  {
    code: '03',
    title: '결제하면 배차·작업·인계서까지',
    desc: '배차·작업·전자인계서까지 이어집니다.',
    image: editorialPlant,
  },
];

/**
 * 이용 방법 3단계 — 에디토리얼 2컬럼 인터랙티브 워크스루.
 * 왼쪽 단계 행을 고르면 오른쪽 다큐멘터리 건축 사진과 현장 주석이 전환된다.
 */
export function HowItWorks() {
  const wide = useWideLayout();
  const [selected, setSelected] = useState(0);
  const current = STEPS[selected];

  return (
    <View>
      <SectionHeading
        eyebrow="진행 순서"
        title="신청부터 처리까지 세 단계"
      />

      <View style={wide ? styles.splitRow : undefined}>
        <View style={wide ? styles.splitList : undefined}>
          {STEPS.map((step, i) => {
            const active = i === selected;
            return (
              <Pressable
                key={step.code}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setSelected(i)}
                style={[
                  styles.stepItem,
                  i > 0 && styles.stepItemBorderTop,
                  active && styles.stepItemActive,
                ]}
              >
                <Text style={[styles.stepCode, TABULAR_NUMS, active && styles.stepCodeActive]}>
                  {step.code}
                </Text>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDesc}>{step.desc}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.photoStage, wide ? styles.photoStageWide : styles.photoStageNarrow]}>
          <Image
            source={current.image}
            style={[styles.photoImg, wide ? styles.photoImgWide : styles.photoImgNarrow]}
            resizeMode="cover"
            accessibilityLabel={current.title}
          />
        </View>
      </View>
    </View>
  );
}

const SECONDARY_FEATURES: ReadonlyArray<{ title: string; desc: string }> = [
  { title: '확인된 업체만 견적', desc: '사업자등록 확인과 승인을 마친 업체만 참여합니다.' },
  { title: '결제 전 총 금액 안내', desc: '운반비·처리비·수수료 합계를 결제 전에 확인합니다.' },
  {
    title: '배차 전 취소는 전액 환불',
    desc: `배차 후 작업 전 취소는 위약금 ${Math.round(CANCELLATION_PENALTY_RATE * 100)}%입니다.`,
  },
];

/**
 * 서비스 특징 — 좌측 올바로 다큐멘터리 포커스 + 우측 3단 헤어라인 명세 원장.
 */
export function Features() {
  const wide = useWideLayout();
  return (
    <View>
      <SectionHeading
        eyebrow="서류까지"
        title="처리까지 책임지는 중개"
      />

      <View style={wide ? styles.featureSplitWide : undefined}>
        <View style={[styles.spotlightCard, wide && styles.spotlightCardWide]}>
          <Image
            source={editorialPlant}
            style={styles.spotlightImg}
            resizeMode="cover"
            accessibilityLabel="건설폐기물 처리장 외관"
          />
          <View style={styles.spotlightBody}>
            <Text style={styles.spotlightTitle}>올바로 전자인계서 자동 처리</Text>
            <Text style={styles.spotlightDesc}>
              의무 대상이면 신청 화면에서 안내하고, 선택하면 자동으로 발행합니다.
            </Text>
          </View>
        </View>

        <View style={[styles.specColumn, wide && styles.specColumnWide]}>
          {SECONDARY_FEATURES.map((f, i) => (
            <View key={f.title} style={[styles.specRow, i === 0 && styles.specRowFirst]}>
              <Text style={styles.specTitle}>{f.title}</Text>
              <Text style={styles.specDesc}>{f.desc}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const PARTNERS: ReadonlyArray<{
  code: string;
  title: string;
  summary: string;
  image: ImageSourcePropType;
}> = [
  {
    code: '01',
    title: '철거업체',
    summary: '근처 철거 요청을 받고 견적을 보냅니다.',
    image: editorialSite,
  },
  {
    code: '02',
    title: '운반업체',
    summary: '콜대기를 켜 두면 주변 운반 콜이 들어옵니다.',
    image: editorialLogistics,
  },
  {
    code: '03',
    title: '처리장',
    summary: '폐기물 반입 예약을 받고 일정을 관리합니다.',
    image: editorialPlant,
  },
];

/**
 * 업체 회원 안내 — 풀블리드 다크 밴드 위 에디토리얼 역할 전환 스튜디오.
 */
export function PartnersSection({ onSignup }: { onSignup: () => void }) {
  const wide = useWideLayout();
  const [roleIdx, setRoleIdx] = useState(0);
  const current = PARTNERS[roleIdx];

  return (
    <View style={[styles.partners, wide && styles.partnersWide]}>
      <View style={wide ? styles.partnersHeadWide : undefined}>
        <SectionHeading
          dark
          eyebrow="업체 회원"
          title={'일감은 받고,\n정산은 다음 영업일에'}
          description="수수료를 뺀 금액을 다음 영업일에 지급합니다."
        />
        <AppButton label="업체로 가입하기" onPress={onSignup} style={styles.partnersButton} />
      </View>

      <View style={wide ? styles.partnersRightWide : styles.partnersRightNarrow}>
        <View style={styles.partnerPreviewBox}>
          <Image
            source={current.image}
            style={styles.partnerImg}
            resizeMode="cover"
            accessibilityLabel={current.title}
          />
        </View>

        <View style={styles.partnersList}>
          {PARTNERS.map((p, idx) => {
            const active = idx === roleIdx;
            return (
              <Pressable
                key={p.title}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setRoleIdx(idx)}
                style={[styles.partnerRow, active && styles.partnerRowActive]}
              >
                <Text style={[styles.partnerCode, TABULAR_NUMS, active && styles.partnerCodeActive]}>
                  {p.code}
                </Text>
                <View style={styles.partnerTextCol}>
                  <Text style={styles.partnerTitle}>{p.title}</Text>
                  <Text style={styles.partnerDesc}>{p.summary}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const { colors, font, spacing, radius, touch, onDark } = theme;

const styles = StyleSheet.create({
  heading: { marginBottom: spacing.lg },
  eyebrow: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  eyebrowDark: {
    color: colors.primarySoft,
  },
  title: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '700',
    letterSpacing: theme.tracking.title,
    lineHeight: 38,
    marginTop: spacing.xs,
  },
  titleDark: {
    color: colors.background,
  },
  titleWide: {
    fontSize: font.display,
    letterSpacing: theme.tracking.display,
    lineHeight: 48,
  },
  description: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 28,
    marginTop: spacing.xs,
  },
  descriptionDark: {
    color: onDark.text,
  },
  splitRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  splitList: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flex: 5,
    justifyContent: 'center',
  },
  stepItem: {
    borderLeftColor: 'transparent',
    borderLeftWidth: 3,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: touch.primaryButtonHeight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  stepItemBorderTop: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  stepItemActive: {
    backgroundColor: colors.surface,
    borderLeftColor: colors.primary,
  },
  stepCode: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  stepCodeActive: {
    color: colors.primary,
  },
  stepContent: {
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
    marginTop: 4,
  },
  photoStage: {
    backgroundColor: onDark.canvas,
    borderColor: colors.borderStrong,
    borderRadius: radius.button,
    borderWidth: 1,
    overflow: 'hidden',
  },
  photoStageWide: {
    flex: 7,
  },
  photoStageNarrow: {
    marginTop: spacing.md,
    width: '100%',
  },
  photoImg: {
    width: '100%',
  },
  photoImgWide: {
    height: 360,
  },
  photoImgNarrow: {
    height: 220,
  },
  featureSplitWide: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  spotlightCard: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  spotlightCardWide: {
    flex: 5,
    marginBottom: 0,
  },
  spotlightImg: {
    height: 220,
    width: '100%',
  },
  spotlightBody: {
    padding: spacing.lg,
  },
  spotlightTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '700',
    letterSpacing: theme.tracking.title,
    marginTop: spacing.xs,
  },
  spotlightDesc: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 28,
    marginTop: spacing.xs,
  },
  specColumn: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  specColumnWide: {
    flex: 7,
  },
  specRow: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingVertical: spacing.lg,
  },
  specRowFirst: {
    borderTopWidth: 0,
  },
  specTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '700',
    letterSpacing: theme.tracking.title,
    marginTop: 4,
  },
  specDesc: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 28,
    marginTop: 4,
  },
  partners: {},
  partnersWide: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.lg * 2,
  },
  partnersHeadWide: {
    flex: 5,
  },
  partnersButton: {
    alignSelf: 'flex-start',
    minWidth: 220,
  },
  partnersRightWide: {
    flex: 7,
  },
  partnersRightNarrow: {
    marginTop: spacing.lg,
  },
  partnerPreviewBox: {
    backgroundColor: onDark.surface,
    borderColor: onDark.border,
    borderRadius: radius.button,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  partnerImg: {
    height: 220,
    width: '100%',
  },
  partnersList: {
    borderTopColor: onDark.border,
    borderTopWidth: 1,
  },
  partnerRow: {
    alignItems: 'center',
    borderBottomColor: onDark.border,
    borderBottomWidth: 1,
    borderLeftColor: 'transparent',
    borderLeftWidth: 3,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  partnerRowActive: {
    backgroundColor: onDark.surface,
    borderLeftColor: colors.primary,
  },
  partnerCode: {
    color: onDark.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  partnerCodeActive: {
    color: colors.primarySoft,
  },
  partnerTextCol: { flex: 1 },
  partnerTitle: { color: colors.background, fontSize: font.bodyLarge, fontWeight: '700' },
  partnerDesc: { color: onDark.text, fontSize: font.body, lineHeight: 26, marginTop: 4 },
});
