import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './AppIcon';
import { AppButton } from './ui';
import { PressableScale } from './motion';
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
        {/* 전체 화면 모달이라 노치·홈 인디케이터를 직접 피해야 한다. */}
        <View
          style={[
            styles.modalCard,
            { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md },
          ]}
        >
          {/* 제목과 닫기 버튼을 한 줄에 둔다 — 예전엔 닫기가 절대 배치라 긴 제목과 겹쳤다. */}
          <View style={styles.headerRow}>
            <Text style={styles.counter}>
              {activeStep} / {CONSUMER_STEPS.length}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="가이드 닫기"
              onPress={onClose}
              style={styles.closeBtn}
            >
              <AppIcon name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <Text style={styles.mainTitle}>{isNewUser ? '처음 오셨나요?' : '이용 방법'}</Text>
          <Text style={styles.mainSubtitle}>신청부터 결제까지 순서대로 안내합니다.</Text>

          <View style={styles.progressTrack}>
            {CONSUMER_STEPS.map((step) => (
              <Pressable
                key={step.step}
                accessibilityRole="button"
                accessibilityLabel={`${step.step}단계 보기`}
                onPress={() => setActiveStep(step.step)}
                style={[styles.progressSeg, step.step <= activeStep && styles.progressSegOn]}
              />
            ))}
          </View>

          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <GuideStepCard step={current} />
          </ScrollView>

          <View style={styles.footer}>
            <AppButton
              label={isLast ? '시작하기' : '다음'}
              onPress={() => (isLast ? onClose() : setActiveStep((prev) => prev + 1))}
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

const { colors, font, spacing, touch } = theme;

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: colors.background,
    flex: 1,
  },
  modalCard: {
    // 데스크톱 웹에서 안내 문구가 브라우저 끝까지 늘어나지 않게(폰에서는 영향 없음).
    alignSelf: 'center',
    backgroundColor: colors.background,
    flex: 1,
    maxWidth: theme.wideFormWidth,
    width: '100%',
    // paddingTop / paddingBottom 은 안전영역에 맞춰 런타임에 정한다.
    paddingHorizontal: spacing.md,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  counter: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
  closeBtn: {
    alignItems: 'center',
    // 손가락으로 정확히 누를 수 있게 48px 터치 영역을 확보한다.
    height: touch.minButtonHeight,
    justifyContent: 'center',
    marginRight: -spacing.xs,
    width: touch.minButtonHeight,
  },
  mainTitle: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  mainSubtitle: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 28,
    marginBottom: spacing.md,
  },
  progressTrack: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  progressSeg: {
    backgroundColor: colors.border,
    borderRadius: 2,
    flex: 1,
    height: 4,
  },
  progressSegOn: {
    backgroundColor: colors.primary,
  },
  bodyScroll: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: spacing.md,
  },
  footer: {
    paddingTop: spacing.sm,
  },
  neverBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
    // "다시 보지 않기"도 버튼이다 — 터치 영역을 48px 로 맞춘다.
    minHeight: touch.minButtonHeight,
  },
  neverBtnText: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
});
