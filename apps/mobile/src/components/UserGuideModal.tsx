import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from './ui';
import { AppIcon, type IconName } from './AppIcon';
import { FadeInUp, PressableScale } from './motion';
import { theme } from '../theme';

interface StepItem {
  step: number;
  title: string;
  icon: IconName;
  summary: string;
  details: string[];
  tip: string;
}

const CONSUMER_STEPS: StepItem[] = [
  {
    step: 1,
    title: '현장 사진 한 장으로 간편 신청',
    icon: 'camera',
    summary: '철거·원상복구 박스를 누르고 사진을 올려주세요',
    details: [
      '홈 화면의 [철거 · 원상복구 신청하기]를 누릅니다.',
      '철거할 현장 사진을 촬영하거나 앨범에서 선택하세요.',
      'AI가 사진 속 공간 면적과 폐기물 종류를 자동 분석해 견적서를 채워드립니다.',
    ],
    tip: '현장 전체 전경과 세부 사진을 함께 올리시면 더 정확한 견적을 받으실 수 있어요.',
  },
  {
    step: 2,
    title: '검증된 업체의 투명한 비교 견적',
    icon: 'shield',
    summary: '올바로 인증·사업자 검증을 마친 업체들이 견적을 제시해요',
    details: [
      '신청 접수 후 지역 전문 철거업체들의 맞춤 견적이 도착합니다.',
      '업체별 견적 금액, 시공 후기, 평점을 꼼꼼히 비교해 보세요.',
      '채팅을 통해 현장 일정이나 특이사항을 사전에 자유롭게 조율할 수 있습니다.',
    ],
    tip: '비움에 등록된 업체는 사업자등록번호 확인과 관리자 승인을 거친 뒤에만 견적을 보낼 수 있습니다.',
  },
  {
    // 결제는 **에스크로가 아니라 선결제**다([[CLAUDE.md]] 핵심 비즈니스 규칙).
    // 예전 문구가 "공사 완료까지 대금 보호"라고 설명하고 있었는데, 실제 동작과 반대라
    // 분쟁이 나면 그대로 문제가 된다. 사용자가 실제로 겪는 순서대로 다시 썼다.
    step: 3,
    title: '결제 후 원스톱 시공',
    icon: 'card',
    summary: '매칭이 확정되면 총 금액을 먼저 결제하고 작업이 시작돼요',
    details: [
      '업체를 선택하면 운반비·처리비·수수료를 합한 총 금액을 결제합니다.',
      '배차 전에 취소하면 전액 환불되고, 배차 후 작업 시작 전에는 위약금을 뺀 금액이 환불됩니다.',
      '작업이 끝나면 올바로 전자인계서까지 앱에서 한 번에 처리됩니다.',
    ],
    tip: '결제수단은 계좌이체(가상계좌)와 카드 모두 쓸 수 있고, 세금계산서는 정산 확정 시점에 자동 발행됩니다.',
  },
];

export function UserGuideModal({
  visible,
  onClose,
  onNeverShowAgain,
  isNewUser = false,
}: {
  visible: boolean;
  onClose: () => void;
  onNeverShowAgain?: () => void;
  isNewUser?: boolean;
}) {
  const [activeStep, setActiveStep] = useState(1);
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const current = CONSUMER_STEPS.find((s) => s.step === activeStep) ?? CONSUMER_STEPS[0];

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* 전체 화면 모달이라 노치·홈 인디케이터를 직접 피해야 한다
            (예전엔 상단 여백을 60 으로 박아 둬서 기기마다 여백이 틀어졌다). */}
        <View
          style={[
            styles.modalCard,
            { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg },
          ]}
        >
          {/* 상단 닫기 버튼 */}
          <FadeInUp delay={20}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="가이드 닫기"
              onPress={onClose}
              style={[styles.closeBtn, { top: insets.top + spacing.sm }]}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </FadeInUp>

          {/* 환영 헤더 영역 */}
          <FadeInUp delay={100} style={styles.header}>

            <Text style={styles.mainTitle}>
              {isNewUser ? '비움과 함께 시작해볼까요?' : '철거 · 원상복구 이용 방법'}
            </Text>
            <Text style={styles.mainSubtitle}>
              복잡하고 어려운 철거와 폐기물, 3단계로 안전하고 간편하게 끝내세요.
            </Text>
          </FadeInUp>

          {/* 스텝 인디케이터 (Dots) */}
          <FadeInUp delay={200} style={styles.dotIndicatorContainer}>
            {CONSUMER_STEPS.map((s) => {
              const isSelected = s.step === activeStep;
              return (
                <Pressable
                  key={s.step}
                  onPress={() => setActiveStep(s.step)}
                  style={[styles.dot, isSelected && styles.dotSelected]}
                />
              );
            })}
          </FadeInUp>

          {/* 스텝 상세 컨텐츠 */}
          <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            <FadeInUp key={current.step} delay={30} style={styles.stepCard}>
              <View style={styles.stepIconWrapper}>
                <View style={styles.stepIconCircle}>
                  <AppIcon name={current.icon} size={48} color={theme.colors.primary} filled />
                </View>
              </View>
              
              <Text style={styles.stepTitle}>
                <Text style={styles.stepNumberText}>{current.step}단계. </Text>
                {current.title}
              </Text>
              <Text style={styles.stepSummary}>{current.summary}</Text>

              <View style={styles.detailsList}>
                {current.details.map((detail, idx) => (
                  <View key={idx} style={styles.detailRow}>
                    <View style={styles.detailBullet}>
                      <Text style={styles.detailBulletText}>✓</Text>
                    </View>
                    <Text style={styles.detailText}>{detail}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.tipBox}>
                <View style={styles.tipTitleRow}>
                  <Text style={styles.tipEmoji}>💡</Text>
                  <Text style={styles.tipTitle}>알아두면 유용한 팁</Text>
                </View>
                <Text style={styles.tipText}>{current.tip}</Text>
              </View>
            </FadeInUp>

            {/* 하단 안심 뱃지 목록 */}
            <FadeInUp delay={100} style={styles.guaranteeRow}>
              <View style={styles.guaranteeItem}>
                <AppIcon name="shield" size={20} color={theme.colors.primary} filled />
                <Text style={styles.guaranteeText}>사업자 검증 완료 업체</Text>
              </View>
              <View style={styles.guaranteeItem}>
                <AppIcon name="document" size={20} color={theme.colors.primary} filled />
                <Text style={styles.guaranteeText}>올바로 전자인계서 자동</Text>
              </View>
            </FadeInUp>
          </ScrollView>

          {/* 하단 버튼 영역 */}
          <FadeInUp delay={300} style={styles.footer}>
            <AppButton
              label={activeStep < 3 ? '다음으로 ➔' : '비움 시작하기 ➔'}
              onPress={() => {
                if (activeStep < 3) {
                  setActiveStep((prev) => prev + 1);
                } else {
                  onClose();
                }
              }}
              style={styles.actionButton}
            />
            {onNeverShowAgain ? (
              <PressableScale
                accessibilityRole="button"
                onPress={onNeverShowAgain}
                style={styles.neverBtn}
              >
                <Text style={styles.neverBtnText}>다시 보지 않기</Text>
              </PressableScale>
            ) : null}
          </FadeInUp>
        </View>
      </View>
    </Modal>
  );
}

const { colors, font, spacing, radius, touch } = theme;

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: colors.surface,
    flex: 1,
  },
  modalCard: {
    backgroundColor: colors.surface,
    flex: 1,
    // paddingTop / paddingBottom 은 안전영역에 맞춰 런타임에 정한다.
    paddingHorizontal: spacing.lg,
  },
  closeBtn: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.badge,
    borderWidth: 1,
    // 손가락으로 정확히 누를 수 있게 48px 터치 영역을 확보한다.
    height: touch.minButtonHeight,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.lg,
    // top 은 안전영역에 맞춰 런타임에 정한다.
    width: touch.minButtonHeight,
    zIndex: 10,
  },
  closeBtnText: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.lg,
  },
  badgeWrap: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  badge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
  },
  badgeText: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  mainTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  mainSubtitle: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  dotIndicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.lg,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
  },
  dotSelected: {
    width: 32,
    backgroundColor: colors.primary,
  },
  bodyScroll: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 64,
  },
  stepCard: {
    backgroundColor: colors.background,
    borderRadius: 24,
    padding: spacing.lg,
    alignItems: 'center',
    shadowColor: theme.colors.cameraBackground,
    shadowOpacity: 0.04,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    marginBottom: spacing.md,
  },
  stepIconWrapper: {
    marginBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  stepIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(59,130,246,0.3)',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  stepTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  stepNumberText: {
    color: colors.primary,
  },
  stepSummary: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  detailsList: {
    width: '100%',
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  detailBullet: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginTop: spacing.xs / 2,
  },
  detailBulletText: {
    color: colors.background,
    fontSize: theme.glyph.inline,
    fontWeight: '900',
  },
  detailText: {
    flex: 1,
    color: colors.text,
    fontSize: font.bodyLarge,
    lineHeight: 24,
    fontWeight: '600',
  },
  tipBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: 20,
    padding: spacing.lg,
    width: '100%',
  },
  tipTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tipEmoji: {
    fontSize: 18,
    marginRight: spacing.xs,
  },
  tipTitle: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  tipText: {
    color: colors.primaryDark,
    fontSize: font.bodyLarge,
    lineHeight: 24,
    fontWeight: '700',
  },
  guaranteeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  guaranteeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  guaranteeText: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '800',
  },
  footer: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
  },
  actionButton: {
    borderRadius: radius.pill,
    height: 64,
  },
  neverBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    // "다시 보지 않기"도 버튼이다 — 터치 영역을 48px 로 맞춘다.
    minHeight: touch.minButtonHeight,
    paddingVertical: spacing.xs,
  },
  neverBtnText: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

