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
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* 모달 상단 헤더 */}
          <View style={styles.header}>
            <View style={styles.badgeWrap}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {isNewUser ? '🎉 회원가입 환영 가이드' : '💡 비움 이용 가이드'}
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="가이드 닫기"
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <Text style={styles.mainTitle}>철거 · 원상복구 이용 방법</Text>
          <Text style={styles.mainSubtitle}>
            복잡하고 어려운 철거와 폐기물, 3단계로 안전하고 간편하게 끝내세요.
          </Text>

          {/* 스텝 탭 셀렉터 */}
          <View style={styles.stepTabs}>
            {CONSUMER_STEPS.map((s) => {
              const isSelected = s.step === activeStep;
              return (
                <Pressable
                  key={s.step}
                  onPress={() => setActiveStep(s.step)}
                  style={[styles.stepTab, isSelected && styles.stepTabSelected]}
                >
                  <Text style={[styles.stepTabNumber, isSelected && styles.stepTabNumberSelected]}>
                    {s.step}단계
                  </Text>
                  <Text
                    style={[styles.stepTabLabel, isSelected && styles.stepTabLabelSelected]}
                    numberOfLines={1}
                  >
                    {s.step === 1 ? '사진 신청' : s.step === 2 ? '견적 비교' : '안심 결제'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* 스텝 상세 컨텐츠 */}
          <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyContent}>
            <FadeInUp key={current.step} delay={30}>
              <View style={styles.stepCard}>
                <View style={styles.stepIconCircle}>
                  <AppIcon name={current.icon} size={36} color={theme.colors.primary} />
                </View>
                <Text style={styles.stepTitle}>
                  {current.step}단계: {current.title}
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
                  <Text style={styles.tipTitle}>💡 알아두면 유용한 팁</Text>
                  <Text style={styles.tipText}>{current.tip}</Text>
                </View>
              </View>

              {/* 하단 안심 뱃지 목록 */}
              <View style={styles.guaranteeRow}>
                <View style={styles.guaranteeItem}>
                  <AppIcon name="shield" size={16} color={theme.colors.primary} />
                  <Text style={styles.guaranteeText}>100% 검증 파트너</Text>
                </View>
                <View style={styles.guaranteeItem}>
                  <AppIcon name="lock" size={16} color={theme.colors.primary} />
                  <Text style={styles.guaranteeText}>에스크로 안심 결제</Text>
                </View>
                <View style={styles.guaranteeItem}>
                  <AppIcon name="document" size={16} color={theme.colors.primary} />
                  <Text style={styles.guaranteeText}>올바로 인계서 연동</Text>
                </View>
              </View>
            </FadeInUp>
          </ScrollView>

          {/* 하단 버튼 영역 */}
          <View style={styles.footer}>
            <AppButton
              label={activeStep < 3 ? '다음 단계 보기 ➔' : '비움 시작하기 ➔'}
              onPress={() => {
                if (activeStep < 3) {
                  setActiveStep((prev) => prev + 1);
                } else {
                  onClose();
                }
              }}
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
          </View>
        </View>
      </View>
    </Modal>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(11, 27, 58, 0.55)',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalCard: {
    backgroundColor: colors.background,
    borderRadius: 24,
    maxWidth: 420,
    width: '100%',
    maxHeight: '88%',
    padding: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badgeWrap: {
    flexDirection: 'row',
  },
  badge: {
    backgroundColor: colors.primarySoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  mainTitle: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
    marginBottom: 4,
  },
  mainSubtitle: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  stepTabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: spacing.sm,
  },
  stepTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  stepTabSelected: {
    backgroundColor: colors.background,
    shadowColor: '#0B1B3A',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  stepTabNumber: {
    fontSize: font.caption - 1,
    fontWeight: '700',
    color: colors.textMuted,
  },
  stepTabNumberSelected: {
    color: colors.primary,
  },
  stepTabLabel: {
    fontSize: font.body,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 2,
  },
  stepTabLabelSelected: {
    color: colors.text,
    fontWeight: '800',
  },
  bodyScroll: {
    maxHeight: 330,
  },
  bodyContent: {
    paddingVertical: 4,
  },
  stepCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  stepIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  stepTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  stepSummary: {
    color: colors.textMuted,
    fontSize: font.body,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  detailsList: {
    width: '100%',
    marginVertical: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  detailBullet: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginTop: 2,
  },
  detailBulletText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
  },
  detailText: {
    flex: 1,
    color: colors.text,
    fontSize: font.body,
    lineHeight: 18,
  },
  tipBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: spacing.sm,
    width: '100%',
    marginTop: spacing.xs,
  },
  tipTitle: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
    marginBottom: 2,
  },
  tipText: {
    color: '#1E3A8A',
    fontSize: font.caption,
    lineHeight: 16,
  },
  guaranteeRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  guaranteeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  guaranteeText: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '600',
  },
  footer: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  neverBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingVertical: 6,
  },
  neverBtnText: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
