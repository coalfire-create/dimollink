import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
    tip: '비움의 모든 파트너는 사업자등록증 및 법적 인허가를 전수 검증받은 전문 업체입니다.',
  },
  {
    step: 3,
    title: '에스크로 안심 결제 & 원스톱 시공',
    icon: 'card',
    summary: '공사가 완료될 때까지 결제 대금을 안전하게 보호해요',
    details: [
      '원하는 업체를 선택하고 비움 안심 에스크로 결제를 진행합니다.',
      '시공이 끝나고 고객님이 최종 승인하기 전까지 공사 대금이 안전하게 보호됩니다.',
      '작업 완료 후 법적 폐기물 처리 인계서(올바로)까지 전자적으로 원스톱 처리됩니다.',
    ],
    tip: '부실공사나 먹튀 걱정 없는 100% 안심 결제 시스템이 적용됩니다.',
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

  if (!visible) return null;

  const current = CONSUMER_STEPS.find((s) => s.step === activeStep) ?? CONSUMER_STEPS[0];

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* 상단 닫기 버튼 */}
          <FadeInUp delay={20}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="가이드 닫기"
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </FadeInUp>

          {/* 환영 헤더 영역 */}
          <FadeInUp delay={100} style={styles.header}>
            <View style={styles.badgeWrap}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {isNewUser ? '🎉 환영합니다!' : '💡 비움 이용 가이드'}
                </Text>
              </View>
            </View>
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
                <AppIcon name="shield" size={16} color={theme.colors.primary} filled />
                <Text style={styles.guaranteeText}>100% 검증 파트너</Text>
              </View>
              <View style={styles.guaranteeItem}>
                <AppIcon name="lock" size={16} color={theme.colors.primary} filled />
                <Text style={styles.guaranteeText}>에스크로 안심 결제</Text>
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

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: colors.background,
    flex: 1,
  },
  modalCard: {
    backgroundColor: colors.background,
    flex: 1,
    paddingTop: 60, // Safe area padding
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  closeBtn: {
    position: 'absolute',
    top: 50, // Adjusted for full screen
    right: spacing.lg,
    padding: 8,
    zIndex: 10,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeBtnText: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.xl,
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
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 8,
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
    marginBottom: spacing.xl,
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
    paddingBottom: spacing.xxl,
  },
  stepCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
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
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.primarySoft,
  },
  stepTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
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
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  detailsList: {
    width: '100%',
    marginBottom: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  detailBullet: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  detailBulletText: {
    color: '#FFFFFF',
    fontSize: 14,
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
    marginRight: 6,
  },
  tipTitle: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  tipText: {
    color: '#1E3A8A',
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
    paddingVertical: 10,
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
    backgroundColor: colors.background,
  },
  actionButton: {
    borderRadius: radius.pill,
    height: 64,
  },
  neverBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  neverBtnText: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

