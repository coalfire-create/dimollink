import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AddressSearchResult } from '../../api/client';
import { theme } from '../../theme';

/**
 * 하단 확정 시트 — 지금 핀이 가리키는 주소와 "이 위치로 설정" 버튼.
 *
 * 주소 영역의 높이를 고정해 두는 이유: 로딩 → 결과 → 두 줄 주소를 오갈 때 시트가
 * 들썩이면 아래 버튼이 움직여 엉뚱한 걸 누르게 된다.
 *
 * 주소를 확정하지 못한 경우(키 없음·API 실패)에는 좌표를 주소인 척 보여주지 않는다.
 * 권역이라도 알아냈으면 상세주소를 받아 진행하고, 그마저 없으면 확정을 막는다 —
 * 잘못된 주소로 접수되면 업체가 엉뚱한 현장에 나간다.
 */
export function ConfirmSheet({
  pin,
  moving,
  loading,
  locateDenied,
  detailAddress,
  onChangeDetail,
  needsDetail,
  hasRegion,
  canConfirm,
  onRetry,
  onConfirm,
}: {
  pin: AddressSearchResult | null;
  /** 지도를 잡고 움직이는 중 — 주소가 아직 확정이 아니다. */
  moving: boolean;
  loading: boolean;
  locateDenied: boolean;
  detailAddress: string;
  onChangeDetail: (value: string) => void;
  needsDetail: boolean;
  hasRegion: boolean;
  canConfirm: boolean;
  onRetry: () => void;
  onConfirm: () => void;
}) {
  const unresolved = !!pin?.approximate;

  return (
    <View style={styles.card}>
      <View style={styles.handle} />

      <View style={styles.info}>
        <Text style={styles.badge}>선택한 위치</Text>
        {pin && unresolved ? (
          <>
            <Text style={styles.roadAddress} numberOfLines={2}>
              {hasRegion ? `${pin.region} 일대` : '주소를 확인하지 못했어요'}
            </Text>
            <Text style={styles.notice} numberOfLines={2}>
              {hasRegion
                ? '정확한 주소를 찾지 못했어요. 아래에 상세주소를 입력해 주세요.'
                : '잠시 후 다시 시도하거나 위에서 주소를 검색해 주세요.'}
            </Text>
            {!hasRegion ? (
              <Pressable accessibilityRole="button" style={styles.retryBtn} onPress={onRetry}>
                <Text style={styles.retryBtnText}>다시 시도</Text>
              </Pressable>
            ) : null}
          </>
        ) : pin ? (
          <>
            <Text style={[styles.roadAddress, moving && styles.addressPending]} numberOfLines={2}>
              {pin.roadAddressName || pin.addressName}
              {pin.buildingName ? <Text style={styles.building}> · {pin.buildingName}</Text> : null}
            </Text>
            {pin.addressName && pin.addressName !== pin.roadAddressName ? (
              <Text style={[styles.jibun, moving && styles.addressPending]} numberOfLines={1}>
                지번 {pin.addressName}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.placeholder} numberOfLines={2}>
            지도를 움직여 현장 위치를 맞춰주세요
          </Text>
        )}
      </View>

      {locateDenied ? (
        <Text style={styles.locateDenied}>
          위치 권한이 꺼져 있어요. 검색으로 찾거나 지도를 직접 움직여주세요.
        </Text>
      ) : null}

      <TextInput
        style={[styles.detailInput, needsDetail && styles.detailInputRequired]}
        value={detailAddress}
        onChangeText={onChangeDetail}
        placeholder={needsDetail ? '상세주소를 입력해 주세요 (필수)' : '상세주소 (예: 101동 502호)'}
        placeholderTextColor={colors.textMuted}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canConfirm }}
        style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
        onPress={onConfirm}
        disabled={!canConfirm}
      >
        <Text style={[styles.confirmBtnText, !canConfirm && styles.confirmBtnTextDisabled]}>
          {moving || loading
            ? '위치를 확인하는 중…'
            : needsDetail && !detailAddress.trim()
              ? '상세주소를 입력해 주세요'
              : '이 위치로 설정'}
        </Text>
      </Pressable>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.card + 4,
    borderTopRightRadius: radius.card + 4,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    // 지도 위로 떠 있는 시트라 위쪽으로 그림자를 준다(테두리보다 자연스럽다).
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.xs + 4,
  },
  info: {
    minHeight: 88,
    justifyContent: 'center',
    marginBottom: spacing.xs / 2,
  },
  badge: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
    marginBottom: spacing.xs / 2,
  },
  roadAddress: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    lineHeight: font.title + 8,
  },
  building: {
    color: colors.primary,
    fontSize: font.title,
    fontWeight: '800',
  },
  addressPending: {
    opacity: 0.35,
  },
  placeholder: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '600',
    lineHeight: font.bodyLarge + 8,
  },
  jibun: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
  },
  locateDenied: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginBottom: spacing.xs / 2,
  },
  notice: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
    lineHeight: font.caption + 6,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    minHeight: theme.touch.minButtonHeight,
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.primarySoft,
  },
  retryBtnText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  detailInputRequired: {
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  detailInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    minHeight: theme.touch.minButtonHeight,
    fontSize: font.body,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  confirmBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    minHeight: theme.touch.primaryButtonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadow.primary,
  },
  confirmBtnDisabled: {
    backgroundColor: colors.surface,
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmBtnText: {
    color: colors.background,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  confirmBtnTextDisabled: {
    color: colors.textMuted,
  },
});
