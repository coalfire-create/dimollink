import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { GeoPoint } from '@dimol/shared';
import { searchAddress, type AddressSearchResult } from '../api/client';
import { AppIcon } from './AppIcon';
import { theme } from '../theme';

interface AddressPickerFieldProps {
  label: string;
  value: string;
  onChangeAddress: (selectedAddress: string, region: string, location?: GeoPoint) => void;
  placeholder?: string;
  hint?: string;
}

export function AddressPickerField({
  label,
  value,
  onChangeAddress,
  placeholder = '주소를 검색하여 입력해 주세요',
  hint,
}: AddressPickerFieldProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AddressSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AddressSearchResult | null>(null);
  const [detailAddress, setDetailAddress] = useState('');

  async function handleSearch(searchQuery?: string) {
    const q = searchQuery ?? query;
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await searchAddress(q.trim());
      setResults(res);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenModal() {
    setModalVisible(true);
    if (results.length === 0) {
      void handleSearch('양평');
    }
  }

  function handleSelectResult(item: AddressSearchResult) {
    setSelectedItem(item);
  }

  function handleConfirm() {
    if (!selectedItem) return;
    const baseAddr = selectedItem.roadAddressName || selectedItem.addressName;
    const buildingInfo = selectedItem.buildingName ? ` (${selectedItem.buildingName})` : '';
    const detailInfo = detailAddress.trim() ? ` ${detailAddress.trim()}` : '';
    const fullAddress = `${baseAddr}${buildingInfo}${detailInfo}`;

    onChangeAddress(fullAddress, selectedItem.region, selectedItem.location);
    setModalVisible(false);
    setSelectedItem(null);
    setDetailAddress('');
  }

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Pressable accessibilityRole="button" style={styles.searchBtn} onPress={handleOpenModal}>
          <AppIcon name="location" size={16} color={theme.colors.primary} />
          <Text style={styles.searchBtnText}>주소 검색 (카카오)</Text>
        </Pressable>
      </View>

      <Pressable accessibilityRole="button" style={styles.fieldInput} onPress={handleOpenModal}>
        <Text style={value ? styles.inputText : styles.placeholderText} numberOfLines={2}>
          {value || placeholder}
        </Text>
      </Pressable>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>카카오 주소 검색</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setModalVisible(false)}
              style={styles.closeBtn}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="도로명, 지번 또는 건물명 (예: 양근리 120, 양평군청)"
              placeholderTextColor={theme.colors.textMuted}
              returnKeyType="search"
              onSubmitEditing={() => handleSearch()}
            />
            <Pressable
              accessibilityRole="button"
              style={styles.doSearchBtn}
              onPress={() => handleSearch()}
            >
              <Text style={styles.doSearchText}>검색</Text>
            </Pressable>
          </View>

          <View style={styles.quickTags}>
            <Text style={styles.quickLabel}>빠른 추천:</Text>
            {['양평군청', '강상면', '옥천면', '용문역'].map((tag) => (
              <Pressable
                key={tag}
                style={styles.tagChip}
                onPress={() => {
                  setQuery(tag);
                  void handleSearch(tag);
                }}
              >
                <Text style={styles.tagChipText}>{tag}</Text>
              </Pressable>
            ))}
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>주소를 찾는 중…</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.resultList}
              keyboardShouldPersistTaps="handled"
            >
              {results.map((item, idx) => {
                const isSelected = selectedItem?.addressName === item.addressName;
                return (
                  <Pressable
                    key={`${item.addressName}-${idx}`}
                    style={[styles.resultCard, isSelected && styles.resultCardSelected]}
                    onPress={() => handleSelectResult(item)}
                  >
                    <View style={styles.resultHeader}>
                      <Text style={styles.regionBadge}>{item.region}</Text>
                      {item.buildingName ? (
                        <Text style={styles.buildingTag}>{item.buildingName}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.roadAddress}>{item.roadAddressName}</Text>
                    <Text style={styles.jibunAddress}>지번: {item.addressName}</Text>
                  </Pressable>
                );
              })}

              {results.length === 0 && !loading ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>검색 결과가 없어요.</Text>
                  <Text style={styles.emptySubText}>도로명 주소나 동/리 이름을 입력해 보세요.</Text>
                </View>
              ) : null}
            </ScrollView>
          )}

          {selectedItem ? (
            <View style={styles.confirmSection}>
              <Text style={styles.confirmTitle}>선택한 주소:</Text>
              <Text style={styles.confirmAddress}>
                {selectedItem.roadAddressName}{' '}
                {selectedItem.buildingName ? `(${selectedItem.buildingName})` : ''}
              </Text>

              <TextInput
                style={styles.detailInput}
                value={detailAddress}
                onChangeText={setDetailAddress}
                placeholder="상세주소 입력 (예: 1층 101호, B동 지하1층)"
                placeholderTextColor={theme.colors.textMuted}
              />

              <Pressable
                accessibilityRole="button"
                style={styles.confirmBtn}
                onPress={handleConfirm}
              >
                <Text style={styles.confirmBtnText}>이 주소로 선택 완료</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  label: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radius.button,
  },
  searchBtnText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
    marginLeft: 4,
  },
  fieldInput: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    justifyContent: 'center',
    minHeight: 52,
  },
  inputText: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '600',
  },
  placeholderText: {
    color: colors.textMuted,
    fontSize: font.body,
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs,
  },
  modalScreen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 50,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: font.title,
    fontWeight: '800',
    color: colors.text,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeBtnText: {
    fontSize: font.titleLarge,
    color: colors.textMuted,
  },
  searchBox: {
    flexDirection: 'row',
    padding: spacing.md,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: font.body,
    color: colors.text,
    marginRight: spacing.xs,
  },
  doSearchBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  doSearchText: {
    color: '#FFFFFF',
    fontSize: font.body,
    fontWeight: '700',
  },
  quickTags: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  quickLabel: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginRight: spacing.xs,
  },
  tagChip: {
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginRight: spacing.xs,
  },
  tagChipText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '600',
  },
  loadingBox: {
    alignItems: 'center',
    marginTop: 40,
  },
  loadingText: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: font.body,
  },
  resultList: {
    paddingHorizontal: spacing.md,
    paddingBottom: 140,
  },
  resultCard: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1.5,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  resultCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  regionBadge: {
    backgroundColor: colors.primary,
    color: '#FFFFFF',
    fontSize: font.caption - 2,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  buildingTag: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  roadAddress: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    marginBottom: 2,
  },
  jibunAddress: {
    color: colors.textMuted,
    fontSize: font.caption,
  },
  emptyBox: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  emptySubText: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
  confirmSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    ...theme.shadow.card,
  },
  confirmTitle: {
    color: colors.textMuted,
    fontSize: font.caption,
  },
  confirmAddress: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    marginVertical: 4,
  },
  detailInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    fontSize: font.body,
    color: colors.text,
    marginVertical: spacing.xs,
  },
  confirmBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
});
