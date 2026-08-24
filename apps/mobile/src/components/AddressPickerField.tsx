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
import { coord2Address, searchAddress, type AddressSearchResult } from '../api/client';
import { AppIcon } from './AppIcon';
import { theme } from '../theme';

interface AddressPickerFieldProps {
  label: string;
  value: string;
  onChangeAddress: (selectedAddress: string, region: string, location?: GeoPoint) => void;
  placeholder?: string;
  hint?: string;
}

type PickerTab = 'search' | 'map';

export function AddressPickerField({
  label,
  value,
  onChangeAddress,
  placeholder = '주소를 검색하거나 지도에서 선택해 주세요',
  hint,
}: AddressPickerFieldProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [tab, setTab] = useState<PickerTab>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AddressSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AddressSearchResult | null>(null);
  const [detailAddress, setDetailAddress] = useState('');

  // 📍 지도에서 핀포인트 찝기 상태
  const [mapLat, setMapLat] = useState<number>(37.3613376); // 기본: 정자동/분당
  const [mapLng, setMapLng] = useState<number>(127.1055431);
  const [mapPinLoading, setMapPinLoading] = useState(false);
  const [mapPinResult, setMapPinResult] = useState<AddressSearchResult | null>(null);

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

  async function updateMapPin(lat: number, lng: number) {
    setMapLat(lat);
    setMapLng(lng);
    setMapPinLoading(true);
    try {
      const res = await coord2Address(lat, lng);
      setMapPinResult(res);
      setSelectedItem(res);
    } catch {
      setMapPinResult(null);
    } finally {
      setMapPinLoading(false);
    }
  }

  function handleOpenModal() {
    setModalVisible(true);
    if (results.length === 0) {
      if (value) {
        setQuery(value);
        void handleSearch(value);
      } else {
        void handleSearch('정자일로 121');
      }
    }
  }

  function handleSelectResult(item: AddressSearchResult) {
    setSelectedItem(item);
  }

  function handleConfirm() {
    if (!selectedItem) return;
    const baseAddr = selectedItem.roadAddressName || selectedItem.addressName;
    const buildingInfo =
      selectedItem.buildingName && !baseAddr.includes(selectedItem.buildingName)
        ? ` (${selectedItem.buildingName})`
        : '';
    const detailInfo = detailAddress.trim() ? ` ${detailAddress.trim()}` : '';
    const fullAddress = `${baseAddr}${buildingInfo}${detailInfo}`;

    onChangeAddress(fullAddress, selectedItem.region, selectedItem.location);
    setModalVisible(false);
    setSelectedItem(null);
    setDetailAddress('');
  }

  function handleSwitchToMapTab() {
    setTab('map');
    if (!mapPinResult) {
      void updateMapPin(mapLat, mapLng);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Pressable accessibilityRole="button" style={styles.searchBtn} onPress={handleOpenModal}>
          <AppIcon name="location" size={16} color={theme.colors.primary} />
          <Text style={styles.searchBtnText}>카카오 지도/주소</Text>
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
            <Text style={styles.modalTitle}>카카오 위치 / 주소 선택</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setModalVisible(false)}
              style={styles.closeBtn}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* 탭 헤더: 주소 검색 vs 지도에서 찝기 */}
          <View style={styles.tabContainer}>
            <Pressable
              accessibilityRole="tab"
              style={[styles.tabItem, tab === 'search' && styles.tabItemActive]}
              onPress={() => setTab('search')}
            >
              <Text style={[styles.tabText, tab === 'search' && styles.tabTextActive]}>
                🔍 주소·건물명 검색
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              style={[styles.tabItem, tab === 'map' && styles.tabItemActive]}
              onPress={handleSwitchToMapTab}
            >
              <Text style={[styles.tabText, tab === 'map' && styles.tabTextActive]}>
                📍 지도에서 직접 찝기
              </Text>
            </Pressable>
          </View>

          {tab === 'search' ? (
            <>
              <View style={styles.searchBox}>
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="도로명, 지번 또는 건물명 (예: 정자일로 121, 양평군청)"
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
                <Text style={styles.quickLabel}>인기 지역:</Text>
                {[
                  { label: '분당 정자', q: '정자일로 121' },
                  { label: '서울 강남', q: '테헤란로 152' },
                  { label: '경기 양평', q: '양평군청' },
                ].map((item) => (
                  <Pressable
                    key={item.label}
                    style={styles.tagChip}
                    onPress={() => {
                      setQuery(item.q);
                      void handleSearch(item.q);
                    }}
                  >
                    <Text style={styles.tagChipText}>{item.label}</Text>
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
                        {item.addressName && item.addressName !== item.roadAddressName ? (
                          <Text style={styles.jibunAddress}>지번: {item.addressName}</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}

                  {results.length === 0 && !loading ? (
                    <View style={styles.emptyBox}>
                      <Text style={styles.emptyText}>검색 결과가 없어요.</Text>
                      <Text style={styles.emptySubText}>
                        도로명 주소나 동/리 이름을 입력해 보세요.
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>
              )}
            </>
          ) : (
            /* 📍 지도에서 핀포인트 찝기 탭 */
            <View style={styles.mapTabContainer}>
              <View style={styles.mapCanvasBox}>
                <View style={styles.mapGridPattern}>
                  <Text style={styles.mapGridBgText}>🗺️ 카카오 지도 연동 캔버스</Text>
                  <View style={styles.centerPinContainer}>
                    <Text style={styles.centerPinEmoji}>📍</Text>
                    <View style={styles.centerPinShadow} />
                  </View>
                </View>

                {/* 핀 이동 / 미세 조율 컨트롤러 */}
                <View style={styles.mapControlsRow}>
                  <Text style={styles.mapControlTitle}>위치 핀 미세 이동:</Text>
                  <View style={styles.arrowGroup}>
                    <Pressable
                      style={styles.arrowBtn}
                      onPress={() => updateMapPin(mapLat + 0.001, mapLng)}
                    >
                      <Text style={styles.arrowText}>▲ 북</Text>
                    </Pressable>
                    <Pressable
                      style={styles.arrowBtn}
                      onPress={() => updateMapPin(mapLat - 0.001, mapLng)}
                    >
                      <Text style={styles.arrowText}>▼ 남</Text>
                    </Pressable>
                    <Pressable
                      style={styles.arrowBtn}
                      onPress={() => updateMapPin(mapLat, mapLng - 0.001)}
                    >
                      <Text style={styles.arrowText}>◀ 서</Text>
                    </Pressable>
                    <Pressable
                      style={styles.arrowBtn}
                      onPress={() => updateMapPin(mapLat, mapLng + 0.001)}
                    >
                      <Text style={styles.arrowText}>▶ 동</Text>
                    </Pressable>
                  </View>
                </View>

                {/* 빠른 핀 릴로케이션 버튼 */}
                <View style={styles.presetLocationBar}>
                  {[
                    { name: '분당 정자동', lat: 37.3613, lng: 127.1055 },
                    { name: '강남 역삼동', lat: 37.5002, lng: 127.0364 },
                    { name: '양평군청', lat: 37.4912, lng: 127.4875 },
                  ].map((loc) => (
                    <Pressable
                      key={loc.name}
                      style={styles.presetLocChip}
                      onPress={() => updateMapPin(loc.lat, loc.lng)}
                    >
                      <Text style={styles.presetLocText}>📍 {loc.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {mapPinLoading ? (
                <View style={styles.mapLoadingBox}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={styles.mapLoadingText}>핀 위치 주소를 분석 중…</Text>
                </View>
              ) : mapPinResult ? (
                <View style={styles.mapResultCard}>
                  <Text style={styles.mapResultBadge}>카카오 핀포인트 역지오코딩</Text>
                  <Text style={styles.mapResultRoad}>
                    {mapPinResult.roadAddressName}{' '}
                    {mapPinResult.buildingName ? `(${mapPinResult.buildingName})` : ''}
                  </Text>
                  <Text style={styles.mapResultJibun}>지번: {mapPinResult.addressName}</Text>
                  <Text style={styles.mapResultCoord}>
                    좌표: {mapLat.toFixed(5)}, {mapLng.toFixed(5)}
                  </Text>
                </View>
              ) : null}
            </View>
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
                <Text style={styles.confirmBtnText}>이 핀/주소로 선택 완료</Text>
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
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabItem: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  tabItemActive: {
    borderBottomWidth: 3,
    borderBottomColor: colors.primary,
    backgroundColor: colors.background,
  },
  tabText: {
    fontSize: font.body,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '800',
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
    paddingBottom: 160,
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
  mapTabContainer: {
    padding: spacing.md,
    paddingBottom: 160,
  },
  mapCanvasBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 2,
    borderRadius: radius.card,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  mapGridPattern: {
    width: '100%',
    height: 180,
    backgroundColor: '#EBF3FE',
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#C3DCFE',
  },
  mapGridBgText: {
    color: '#8BAEDF',
    fontSize: font.caption,
    fontWeight: '600',
  },
  centerPinContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPinEmoji: {
    fontSize: 40,
  },
  centerPinShadow: {
    width: 14,
    height: 6,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 999,
  },
  mapControlsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  mapControlTitle: {
    color: colors.text,
    fontSize: font.caption,
    fontWeight: '700',
  },
  arrowGroup: {
    flexDirection: 'row',
  },
  arrowBtn: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.button,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 4,
    marginLeft: 4,
  },
  arrowText: {
    color: colors.text,
    fontSize: font.caption - 1,
    fontWeight: '700',
  },
  presetLocationBar: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  presetLocChip: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.button,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginRight: spacing.xs,
  },
  presetLocText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  mapLoadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  mapLoadingText: {
    color: colors.textMuted,
    fontSize: font.body,
    marginLeft: spacing.xs,
  },
  mapResultCard: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1.5,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  mapResultBadge: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '800',
    marginBottom: 4,
  },
  mapResultRoad: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    marginBottom: 2,
  },
  mapResultJibun: {
    color: colors.textMuted,
    fontSize: font.caption,
  },
  mapResultCoord: {
    color: colors.textMuted,
    fontSize: font.caption - 1,
    marginTop: 4,
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
