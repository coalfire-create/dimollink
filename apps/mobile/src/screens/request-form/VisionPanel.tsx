import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { FormSectionLabel } from '../../components/form/FormSectionLabel';
import { theme } from '../../theme';
import { VisionResultCard } from './VisionResultCard';
import { VisionSteps } from './VisionSteps';
import type { RequestFormState } from './useRequestForm';

/**
 * 현장 사진 분석 패널 — 주소 → 건물 정보 → 사진의 3단계와 촬영 진입점.
 *
 * 단계를 그려 두는 이유: 사진 촬영 버튼이 왜 잠겨 있는지가 버튼만 봐서는 안 보인다.
 * "주소를 먼저 지정해야 한다"는 순서 자체가 분석 품질의 전제라, 순서를 화면에 드러낸다.
 */
export function VisionPanel({ form }: { form: RequestFormState }) {
  const {
    addressReady,
    ledgerState,
    dimolVision,
    photoBusy,
    photoSummary,
    visionLocked,
    visionDisabled,
    guardVision,
    setGuidedOpen,
    setCameraOpen,
    fillFromPhoto,
  } = form;

  return (
    <>
      <FormSectionLabel icon={<Feather name="camera" size={18} color={colors.primary} />}>
        현장 사진 분석
      </FormSectionLabel>

      <VisionSteps
        addressReady={addressReady}
        ledgerDone={ledgerState === 'found' || ledgerState === 'none'}
        ledgerBusy={ledgerState === 'loading'}
        photoDone={!!dimolVision}
        photoBusy={photoBusy}
      />

      {visionLocked ? (
        <View style={styles.lockNotice}>
          <Text style={styles.lockTitle}>먼저 현장 주소를 지정해 주세요</Text>
          <Text style={styles.lockBody}>
            주소를 지정하면 건축물대장(공공데이터)을 통해 건물의 용도·구조·층수·사용승인일을 먼저
            확인한 후, 해당 정보를 바탕으로 현장 사진을 분석합니다. 이를 통해 철거 공정과 위험
            요소를 정확하게 파악할 수 있습니다.
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: visionDisabled }}
        style={[styles.fillBtn, visionDisabled && styles.btnDisabled]}
        onPress={() => guardVision(() => setGuidedOpen(true))}
        disabled={visionDisabled}
      >
        <View style={styles.fillBtnInner}>
          {!photoBusy && ledgerState !== 'loading' ? (
            <Feather name="camera" size={16} color={colors.primary} style={styles.fillBtnIcon} />
          ) : null}
          <Text style={styles.fillText}>
            {photoBusy
              ? '현장 사진 분석 중…'
              : ledgerState === 'loading'
                ? '건축물대장 확인 중…'
                : '가이드 촬영 (현장 전체 빠짐없이)'}
          </Text>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: visionDisabled }}
        style={[styles.altBtn, visionDisabled && styles.btnDisabled]}
        onPress={() => guardVision(() => setCameraOpen(true))}
        disabled={visionDisabled}
      >
        <Text style={styles.altText}>자유 촬영</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: visionDisabled }}
        style={[styles.altBtn, visionDisabled && styles.btnDisabled]}
        onPress={() => guardVision(fillFromPhoto)}
        disabled={visionDisabled}
      >
        <Text style={styles.altText}>또는 앨범에서 선택</Text>
      </Pressable>

      {photoSummary ? <Text style={styles.summary}>{photoSummary}</Text> : null}

      {dimolVision ? <VisionResultCard vision={dimolVision} /> : null}
    </>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  fillBtnInner: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  fillBtnIcon: {
    marginRight: theme.spacing.xs,
  },
  lockNotice: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  lockTitle: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  lockBody: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 24,
    marginTop: spacing.xs,
  },
  fillBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.touch.minButtonHeight,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.xs,
  },
  fillText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '800',
  },
  altBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.touch.minButtonHeight,
    marginBottom: spacing.xs,
  },
  altText: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  summary: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginBottom: spacing.sm,
  },
});
