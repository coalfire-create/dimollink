import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SITE_CAPTURE_COPY, type SiteCaptureSlot } from '@dimol/shared';
import { AppIcon } from '../AppIcon';
import { theme } from '../../theme';

/**
 * 촬영 화면 하단 — 상태 알림 + 셔터 + 건너뛰기/완료.
 *
 * 방향이 어긋나면 셔터가 잠긴다. 막아 두는 이유는 까다롭게 굴려는 게 아니라,
 * 같은 벽을 두 번 찍고 반대쪽을 안 찍은 사진 묶음으로는 물량을 산출할 수 없어서다.
 * 대신 왜 못 찍는지(어느 쪽으로 돌려야 하는지)를 바로 위에 적는다.
 */
export function CaptureControls({
  slot,
  aligned,
  gateActive,
  capturing,
  qualityError,
  hint,
  shotsInSlot,
  onShutter,
  onSkip,
  onFinishMultiple,
}: {
  slot: SiteCaptureSlot | null;
  aligned: boolean;
  /** 방향 게이트가 실제로 작동 중인지(센서 지원 + 판정 대상 슬롯). */
  gateActive: boolean;
  capturing: boolean;
  qualityError: string | null;
  /** 어느 쪽으로 돌려야 하는지 한 줄 안내. */
  hint: string;
  /** 현재 슬롯에서 이미 찍은 장수(다중 촬영 슬롯용). */
  shotsInSlot: number;
  onShutter: () => void;
  onSkip: () => void;
  onFinishMultiple: () => void;
}) {
  return (
    <View style={styles.bottomArea} pointerEvents="box-none">
      {qualityError ? (
        <View style={styles.qualityBanner}>
          <AppIcon name="alert" size={18} color={colors.background} />
          <Text style={styles.qualityBannerText}>{qualityError}</Text>
        </View>
      ) : gateActive ? (
        <View style={[styles.statusPill, aligned ? styles.statusOk : styles.statusWarn]}>
          <Text style={styles.statusText}>
            {aligned ? SITE_CAPTURE_COPY.aligned : SITE_CAPTURE_COPY.misaligned}
          </Text>
          {!aligned && hint ? <Text style={styles.turnHint}>{hint}</Text> : null}
        </View>
      ) : null}

      <View style={styles.bottomBar}>
        {/* 왼쪽: 선택 슬롯일 때 건너뛰기 */}
        <View style={styles.sideSlot}>
          {slot?.optional ? (
            <Pressable style={styles.textBtn} onPress={onSkip} accessibilityRole="button">
              <Text style={styles.textBtnLabel}>건너뛰기</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          style={[styles.shutterOuter, !aligned && styles.shutterDisabled]}
          onPress={onShutter}
          disabled={capturing || !aligned}
          accessibilityRole="button"
          accessibilityLabel="사진 촬영"
          accessibilityState={{ disabled: capturing || !aligned }}
        >
          {capturing ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <View style={styles.shutterInner} />
          )}
        </Pressable>

        {/* 오른쪽: 다중 슬롯일 때 "완료" */}
        <View style={styles.sideSlot}>
          {slot?.allowMultiple ? (
            <Pressable
              style={[styles.doneBtn, shotsInSlot === 0 && styles.doneBtnGhost]}
              onPress={onFinishMultiple}
              accessibilityRole="button"
            >
              <Text style={styles.doneBtnText}>완료</Text>
              <Text style={styles.doneBtnCount}>{shotsInSlot}장</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  bottomArea: { paddingBottom: Platform.OS === 'web' ? spacing.md : 32 },
  qualityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(198,40,40,0.95)',
    borderRadius: radius.card,
    padding: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  qualityBannerText: { color: colors.background, fontSize: font.body, fontWeight: '700', flex: 1 },
  statusPill: {
    alignSelf: 'center',
    flexDirection: 'column',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  statusOk: { backgroundColor: 'rgba(22,163,74,0.92)' },
  statusWarn: { backgroundColor: 'rgba(202,138,4,0.92)' },
  statusText: { color: colors.background, fontSize: font.body, fontWeight: '800' },
  turnHint: {
    color: colors.warningSoft,
    fontSize: font.caption,
    fontWeight: '700',
    marginTop: spacing.xs / 2,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  sideSlot: { width: 72, alignItems: 'center', justifyContent: 'center' },
  textBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  textBtnLabel: { color: colors.background, fontSize: font.body, fontWeight: '700' },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 5,
    borderColor: colors.background,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: { opacity: 0.4 },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.background },
  doneBtn: {
    minWidth: 64,
    height: 56,
    borderRadius: 28,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnGhost: { backgroundColor: 'rgba(0,0,0,0.45)' },
  doneBtnText: { color: colors.background, fontSize: font.body, fontWeight: '800' },
  doneBtnCount: { color: colors.primarySoft, fontSize: font.caption, fontWeight: '700' },
});
