import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './AppIcon';
import { AppButton } from './ui';
import { FadeInUp, PressableScale } from './motion';
import { GuideStepCard } from './guide/GuideStepCard';
import { CONSUMER_STEPS } from './guide/guideSteps';
import { theme } from '../theme';

/**
 * 처음 들어온 배출자에게 보여주는 이용 가이드 — 3단계 전체화면 모달.
 *
 * 홈에 설명을 길게 쓰는 대신 모달로 한 번만 띄운다. 두 번째부터는 방해만 되기 때문에
 * "다시 보지 않기"를 주고, 그 선택은 기기에 남는다.
 *
 * 단계 내용은 [[guideSteps]], 한 단계의 화면은 [[GuideStepCard]] 에 있다.
 */
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
  const isLast = activeStep >= CONSUMER_STEPS.length;

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

          <FadeInUp delay={100} style={styles.header}>
            <Text style={styles.mainTitle}>
              {isNewUser ? '비움과 함께 시작해볼까요?' : '철거 · 원상복구 이용 방법'}
            </Text>
            <Text style={styles.mainSubtitle}>
              복잡하고 어려운 철거와 폐기물, 3단계로 안전하고 간편하게 끝내세요.
            </Text>
          </FadeInUp>

          <FadeInUp delay={200} style={styles.dotIndicatorContainer}>
            {CONSUMER_STEPS.map((step) => (
              <Pressable
                key={step.step}
                accessibilityRole="button"
                accessibilityLabel={`${step.step}단계 보기`}
                onPress={() => setActiveStep(step.step)}
                style={[styles.dot, step.step === activeStep && styles.dotSelected]}
              />
            ))}
          </FadeInUp>

          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <GuideStepCard step={current} />

            <FadeInUp delay={100} style={styles.guaranteeRow}>
              <View style={styles.guaranteeItem}>
                <AppIcon name="shield" size={20} color={colors.primary} filled />
                <Text style={styles.guaranteeText}>사업자 검증 완료 업체</Text>
              </View>
              <View style={styles.guaranteeItem}>
                <AppIcon name="document" size={20} color={colors.primary} filled />
                <Text style={styles.guaranteeText}>올바로 전자인계서 자동</Text>
              </View>
            </FadeInUp>
          </ScrollView>

          <FadeInUp delay={300} style={styles.footer}>
            <AppButton
              label={isLast ? '비움 시작하기 ➔' : '다음으로 ➔'}
              onPress={() => (isLast ? onClose() : setActiveStep((prev) => prev + 1))}
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
    // 카드 배경(surface)과 같은 색이면 테두리 1px 말고는 구분되지 않아 거의 안 보였다.
    backgroundColor: colors.background,
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
  mainTitle: {
    // 닫기 버튼(우상단 48px)이 절대 배치라, 가운데 정렬된 제목이 그 밑으로 들어갔다.
    // 좌우로 버튼 폭만큼 비워 두면 어느 길이의 제목이든 겹치지 않는다.
    paddingHorizontal: touch.minButtonHeight,
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
