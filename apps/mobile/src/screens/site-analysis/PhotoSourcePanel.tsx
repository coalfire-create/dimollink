import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../components/AppIcon';
import { PressableScale } from '../../components/motion';
import { theme } from '../../theme';
import brandmark from '../../../assets/brandmark.png';

/**
 * 사진을 들이는 자리 — 미리보기, 혹은 아직 없으면 업로드 안내와 샘플 체험.
 *
 * 주소를 지정하기 전에는 잠긴다(`locked`). 건물이 무엇인지 모르는 채 찍은 사진은
 * 판독 기준이 없어서, 결과가 나와도 믿을 수 없기 때문이다.
 */
export function PhotoSourcePanel({
  previewUri,
  locked,
  onClearPhoto,
  onTrySample,
}: {
  previewUri?: string;
  locked: boolean;
  onClearPhoto: () => void;
  /** 샘플 사진으로 결과를 미리 보여준다 — 촬영 입구는 아래 버튼들이 따로 맡는다. */
  onTrySample: () => void;
}) {
  if (previewUri) {
    return (
      <View style={styles.previewContainer}>
        <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="cover" />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="사진 다시 선택"
          style={styles.repickChip}
          onPress={onClearPhoto}
        >
          <AppIcon name="recycle" size={16} color={colors.background} />
          <Text style={styles.repickChipText}>다시 선택</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={styles.dropzone}>
      <View style={styles.iconCircle}>
        <Image source={brandmark} style={styles.dropzoneLogo} resizeMode="contain" />
      </View>
      <Text style={styles.dropzoneTitle}>철거 현장 사진을 업로드해 주세요</Text>
      <Text style={styles.dropzoneSub}>
        건물 내부, 지붕, 자재가 잘 보이게 찍으면{'\n'}소재 인식과 공정 가이드가 더욱 정확해집니다
      </Text>
      <PressableScale
        accessibilityRole="button"
        style={[styles.samplePillBtn, locked && styles.locked]}
        onPress={onTrySample}
      >
        <AppIcon name="image" size={18} color={colors.background} />
        <Text style={styles.samplePillBtnText}>샘플 사진으로 기능 체험하기</Text>
      </PressableScale>
    </View>
  );
}

/** 촬영·앨범 입구 두 장. 사진이 이미 있어도 다시 고를 수 있어야 하므로 항상 보인다. */
export function PhotoSourceButtons({
  locked,
  onTakePhoto,
  onPickFromLibrary,
}: {
  locked: boolean;
  onTakePhoto: () => void;
  onPickFromLibrary: () => void;
}) {
  return (
    <View style={styles.pickRow}>
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ disabled: locked }}
        style={[styles.actionCard, locked && styles.locked]}
        onPress={onTakePhoto}
      >
        <View style={styles.actionIconCircle}>
          <AppIcon name="camera" size={26} color={colors.primary} />
        </View>
        <Text style={styles.actionCardTitle}>카메라 촬영</Text>
        <Text style={styles.actionCardSub}>현장에서 직접 촬영</Text>
      </PressableScale>

      <View style={styles.gap} />

      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ disabled: locked }}
        style={[styles.actionCard, locked && styles.locked]}
        onPress={onPickFromLibrary}
      >
        <View style={styles.actionIconCircle}>
          <AppIcon name="document" size={26} color={colors.primary} />
        </View>
        <Text style={styles.actionCardTitle}>앨범에서 선택</Text>
        <Text style={styles.actionCardSub}>저장된 사진 불러오기</Text>
      </PressableScale>
    </View>
  );
}

/** 3D 스캔 입구 — 한 바퀴 영상으로 실측 부피를 얻는다(층고·증축부가 반영된다). */
export function Scan3DEntryCard({
  locked,
  onStartScan,
}: {
  locked: boolean;
  onStartScan: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: locked }}
      style={[styles.scanCard, locked && styles.locked]}
      onPress={onStartScan}
    >
      <View style={styles.actionIconCircle}>
        <AppIcon name="recycle" size={26} color={colors.primary} />
      </View>
      <View style={styles.scanBody}>
        <Text style={styles.actionCardTitle}>3D 스캔 (건물 한 바퀴)</Text>
        <Text style={styles.actionCardSub}>
          45~60초 촬영으로 실제 크기를 재서 물량을 더 정확하게 산정해요
        </Text>
      </View>
    </PressableScale>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  gap: {
    width: theme.spacing.sm,
  },
  scanBody: {
    flex: 1,
  },
  dropzone: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  dropzoneLogo: {
    width: 44,
    height: 44,
  },
  dropzoneTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.xs / 2,
  },
  dropzoneSub: {
    color: colors.textMuted,
    fontSize: font.caption,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  samplePillBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  samplePillBtnText: {
    color: colors.background,
    fontSize: font.body,
    fontWeight: '800',
  },
  previewContainer: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  preview: {
    borderRadius: radius.card,
    height: 240,
    width: '100%',
  },
  repickChip: {
    position: 'absolute',
    right: 12,
    top: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs / 2,
  },
  repickChipText: {
    color: colors.background,
    fontSize: font.caption,
    fontWeight: '700',
  },
  pickRow: {
    flexDirection: 'row',
  },
  locked: {
    opacity: 0.45,
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.card,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  actionIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  actionCardTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  actionCardSub: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
  },
  scanCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    minHeight: 48,
    padding: spacing.md,
  },
});
