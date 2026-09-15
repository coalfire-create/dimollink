import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';
import { ConfirmSheet } from './ConfirmSheet';
import { MapFrame } from './MapFrame';
import { MapSearchBar } from './MapSearchBar';
import type { useAddressPicker } from './useAddressPicker';

/**
 * 위치 선택 전체화면 — 지도 + 검색 + 하단 확정 시트.
 *
 * 전체화면으로 여는 이유: 지도를 손가락으로 끌어 맞추는 동작이라, 작은 영역에서는
 * 원하는 지점에 핀을 세우기가 어렵다. 폼 안에 작은 지도를 넣는 대신 여기서 한 번에
 * 확정하고 돌아간다.
 */
export type AddressPickerState = ReturnType<typeof useAddressPicker>;

export function AddressPickerModal({ picker }: { picker: AddressPickerState }) {
  return (
    <Modal visible={picker.modalVisible} animationType="slide" onRequestClose={picker.closeModal}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>현장 위치 선택</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="닫기"
            onPress={picker.closeModal}
            style={styles.closeBtn}
            hitSlop={8}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.mapViewport}>
          <MapFrame
            mapUrl={picker.mapUrl}
            iframeRef={picker.iframeRef}
            webViewRef={picker.webViewRef}
            onNativeMessage={picker.handleNativeMessage}
          />
          <MapSearchBar
            query={picker.query}
            onChangeQuery={picker.changeQuery}
            searching={picker.searching}
            results={picker.searchResults}
            showDropdown={picker.showDropdown}
            onSubmit={picker.runSearch}
            onSelect={picker.selectSearchResult}
          />
        </View>

        <ConfirmSheet
          pin={picker.pinResult}
          moving={picker.pinMoving}
          loading={picker.pinLoading}
          locateDenied={picker.locateDenied}
          detailAddress={picker.detailAddress}
          onChangeDetail={picker.setDetailAddress}
          needsDetail={picker.needsDetail}
          hasRegion={picker.hasRegion}
          canConfirm={picker.canConfirm}
          onRetry={picker.retry}
          onConfirm={picker.confirm}
        />
      </View>
    </Modal>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: {
    fontSize: font.bodyLarge,
    fontWeight: '800',
    color: colors.text,
  },
  closeBtn: {
    width: theme.touch.minButtonHeight,
    height: theme.touch.minButtonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing.xs,
  },
  closeBtnText: {
    fontSize: font.titleLarge,
    color: colors.textMuted,
  },
  mapViewport: {
    flex: 1,
    position: 'relative',
    backgroundColor: theme.colors.primarySoft,
  },
});
