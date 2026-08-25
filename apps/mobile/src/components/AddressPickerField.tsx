import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { GeoPoint } from '@dimol/shared';
import { coord2Address, searchAddress, type AddressSearchResult } from '../api/client';
import { AppIcon } from './AppIcon';
import { theme } from '../theme';

// 지도 초기 중심 좌표(분당 정자동). 지도 HTML은 이 값으로 한 번만 생성되며,
// 이후 핀 이동은 사용자 조작/PAN_TO로만 처리한다(상태를 HTML에 되먹이면 리로드 루프 발생).
const DEFAULT_CENTER = { lat: 37.3613376, lng: 127.1055431 };

interface AddressPickerFieldProps {
  label: string;
  value: string;
  onChangeAddress: (selectedAddress: string, region: string, location?: GeoPoint) => void;
  placeholder?: string;
  hint?: string;
}

interface MapFrameProps {
  mapHtml: string;
  iframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  webViewRef: React.MutableRefObject<WebView | null>;
  onNativeMessage: (event: WebViewMessageEvent) => void;
}

// 🗺 지도 DOM(iframe / WebView) 리로드 방지를 위한 메모이제이션 래퍼
const MapFrame = React.memo(
  function MapFrame({ mapHtml, iframeRef, webViewRef, onNativeMessage }: MapFrameProps) {
    if (Platform.OS === 'web') {
      return (
        <iframe
          ref={iframeRef}
          srcDoc={mapHtml}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          title="카카오 지도"
        />
      );
    }
    return (
      <WebView
        ref={webViewRef}
        source={{ html: mapHtml }}
        originWhitelist={['*']}
        style={styles.webviewMap}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        onMessage={onNativeMessage}
      />
    );
  },
  () => true, // 부모 상태(pinLoading, detailAddress 등)가 바뀌어도 iframe/WebView를 리로드하지 않음
);

export function AddressPickerField({
  label,
  value,
  onChangeAddress,
  placeholder = '지도에서 핀을 올려 정확한 주소를 선택하세요',
  hint,
}: AddressPickerFieldProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AddressSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // 📍 카카오택시 스타일 지도 중심 핀 좌표 (기본: 분당 정자동/서울 강남)
  const [mapLat, setMapLat] = useState<number>(DEFAULT_CENTER.lat);
  const [mapLng, setMapLng] = useState<number>(DEFAULT_CENTER.lng);

  // 카카오 역지오코딩 결과
  const [pinResult, setPinResult] = useState<AddressSearchResult | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [detailAddress, setDetailAddress] = useState('');

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const webViewRef = useRef<WebView | null>(null);
  const lastHandledCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  // 지도 핀 위치가 이동했을 때 카카오 역지오코딩 API 호출 (동일 좌표 중복 호출 방지)
  const handleMapMove = useCallback(async (lat: number, lng: number) => {
    if (
      lastHandledCoordsRef.current &&
      Math.abs(lastHandledCoordsRef.current.lat - lat) < 0.00005 &&
      Math.abs(lastHandledCoordsRef.current.lng - lng) < 0.00005
    ) {
      return;
    }
    lastHandledCoordsRef.current = { lat, lng };

    setMapLat(lat);
    setMapLng(lng);
    setPinLoading(true);
    try {
      const result = await coord2Address(lat, lng);
      setPinResult(result);
    } catch {
      setPinResult({
        addressName: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        roadAddressName: `지정 좌표 (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        region: '지정 위치',
        location: { lat, lng },
      });
    } finally {
      setPinLoading(false);
    }
  }, []);

  // Native WebView 메시지 핸들러
  const handleNativeMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          lat?: number;
          lng?: number;
        };
        if (
          data.type === 'MAP_MOVED' &&
          typeof data.lat === 'number' &&
          typeof data.lng === 'number'
        ) {
          void handleMapMove(data.lat, data.lng);
        }
      } catch {
        // 무시: 지도 외 메시지
      }
    },
    [handleMapMove],
  );

  // 검색창 입력으로 주소/장소 검색
  async function handleSearch(searchQuery?: string) {
    const q = searchQuery ?? query;
    if (!q.trim()) {
      setShowDropdown(false);
      return;
    }
    setSearching(true);
    try {
      const res = await searchAddress(q.trim());
      setSearchResults(res);
      setShowDropdown(true);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  // 지도를 특정 좌표로 이동시킨다 (웹=iframe, 네이티브=WebView 공통).
  // 지도 이동이 끝나면 moveend → 역지오코딩이 자동으로 호출된다.
  function panMapTo(lat: number, lng: number) {
    setMapLat(lat);
    setMapLng(lng);

    if (Platform.OS === 'web') {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'PAN_TO', lat, lng }, '*');
      } else {
        void handleMapMove(lat, lng);
      }
    } else if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`window.__panTo && window.__panTo(${lat}, ${lng}); true;`);
    } else {
      void handleMapMove(lat, lng);
    }
  }

  // 검색 결과 클릭 시 지도를 해당 위치로 이동 (Pan To)
  function handleSelectSearchResult(item: AddressSearchResult) {
    setShowDropdown(false);
    setQuery(item.roadAddressName || item.addressName);

    if (item.location) {
      panMapTo(item.location.lat, item.location.lng);
    }
  }

  function handleOpenModal() {
    setModalVisible(true);
    if (!pinResult) {
      void handleMapMove(mapLat, mapLng);
    }
  }

  function handleConfirm() {
    if (!pinResult) return;
    const baseAddr = pinResult.roadAddressName || pinResult.addressName;
    const buildingInfo =
      pinResult.buildingName && !baseAddr.includes(pinResult.buildingName)
        ? ` (${pinResult.buildingName})`
        : '';
    const detailInfo = detailAddress.trim() ? ` ${detailAddress.trim()}` : '';
    const fullAddress = `${baseAddr}${buildingInfo}${detailInfo}`;

    onChangeAddress(
      fullAddress,
      pinResult.region,
      pinResult.location ?? { lat: mapLat, lng: mapLng },
    );
    setModalVisible(false);
    setDetailAddress('');
  }

  // web message listener for iframe Leaflet map movement
  useEffect(() => {
    if (Platform.OS !== 'web' || !modalVisible) return;

    function handleWebMessage(e: MessageEvent) {
      if (e.data && typeof e.data === 'object' && e.data.type === 'MAP_MOVED') {
        const { lat, lng } = e.data as { lat: number; lng: number };
        if (typeof lat === 'number' && typeof lng === 'number') {
          void handleMapMove(lat, lng);
        }
      }
    }

    window.addEventListener('message', handleWebMessage);
    return () => {
      window.removeEventListener('message', handleWebMessage);
    };
  }, [modalVisible, handleMapMove]);

  // Leaflet map HTML — 초기 좌표로 한 번만 생성(상태 변화에도 재생성/리로드 안 함)
  const mapHtml = useMemo(
    () => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: #e5e3df; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .center-pin-wrap {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -100%);
          z-index: 1000;
          pointer-events: none;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .center-pin-emoji {
          font-size: 42px;
          line-height: 1;
          filter: drop-shadow(0 6px 8px rgba(0,0,0,0.35));
          animation: bouncePin 1.2s infinite ease-in-out alternate;
        }
        .center-pin-shadow {
          width: 16px;
          height: 6px;
          background: rgba(0,0,0,0.25);
          border-radius: 50%;
          margin-top: -4px;
        }
        .leaflet-control-zoom {
          margin-bottom: 90px !important;
          margin-right: 16px !important;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <div class="center-pin-wrap">
        <div class="center-pin-emoji">📍</div>
        <div class="center-pin-shadow"></div>
      </div>
      <script>
        var map = L.map('map', { zoomControl: false }).setView([${DEFAULT_CENTER.lat}, ${DEFAULT_CENTER.lng}], 16);
        L.tileLayer('https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 19,
          attribution: 'Map &copy; OpenStreetMap, &copy; CARTO'
        }).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        // 앱(RN/웹) → 지도 이동 요청용 전역 함수
        window.__panTo = function(lat, lng) {
          map.setView([lat, lng], 16, { animate: true });
        };

        var moveTimer = null;
        function notifyParent() {
          if (moveTimer) clearTimeout(moveTimer);
          moveTimer = setTimeout(function() {
            var center = map.getCenter();
            var payload = { type: 'MAP_MOVED', lat: center.lat, lng: center.lng };
            // 웹(iframe) 경로
            if (window.parent && window.parent !== window) {
              window.parent.postMessage(payload, '*');
            }
            // 네이티브(react-native-webview) 경로
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify(payload));
            }
          }, 200);
        }

        map.on('moveend', notifyParent);

        // 웹 iframe PAN_TO 메시지 수신 (네이티브는 injectJavaScript __panTo 사용)
        window.addEventListener('message', function(e) {
          if (e.data && e.data.type === 'PAN_TO') {
            window.__panTo(e.data.lat, e.data.lng);
          }
        });
      </script>
    </body>
    </html>
  `,
    [],
  );

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Pressable accessibilityRole="button" style={styles.searchBtn} onPress={handleOpenModal}>
          <AppIcon name="location" size={16} color={theme.colors.primary} />
          <Text style={styles.searchBtnText}>📍 지도 핀 찝기</Text>
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
          {/* 상단 닫기 모달 헤더 */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📍 지도 위치 찝기 (카카오 주소)</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setModalVisible(false)}
              style={styles.closeBtn}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* 🗺 카카오택시 스타일 전면 지도 영역 */}
          <View style={styles.mapViewport}>
            <MapFrame
              mapHtml={mapHtml}
              iframeRef={iframeRef}
              webViewRef={webViewRef}
              onNativeMessage={handleNativeMessage}
            />

            {/* 🔍 상단 플로팅 주소/건물명 검색바 */}
            <View style={styles.floatingSearchWrap}>
              <View style={styles.floatingSearchBox}>
                <TextInput
                  style={styles.floatingSearchInput}
                  value={query}
                  onChangeText={(text) => {
                    setQuery(text);
                    if (!text.trim()) setShowDropdown(false);
                  }}
                  placeholder="도로명, 건물명, 지번 검색 (예: 정자일로 121)"
                  placeholderTextColor={theme.colors.textMuted}
                  returnKeyType="search"
                  onSubmitEditing={() => handleSearch()}
                />
                <Pressable
                  accessibilityRole="button"
                  style={styles.floatingSearchBtn}
                  onPress={() => handleSearch()}
                >
                  <Text style={styles.floatingSearchText}>검색</Text>
                </Pressable>
              </View>

              {/* 빠른 추천 지점 칩 */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.quickChipScroll}
              >
                {[
                  { name: '📍 분당 정자역', lat: 37.3613, lng: 127.1055 },
                  { name: '📍 서울 강남역', lat: 37.4979, lng: 127.0276 },
                  { name: '📍 경기 양평군청', lat: 37.4912, lng: 127.4875 },
                  { name: '📍 부산 해운대', lat: 35.1587, lng: 129.1604 },
                ].map((chip) => (
                  <Pressable
                    key={chip.name}
                    style={styles.quickChip}
                    onPress={() => panMapTo(chip.lat, chip.lng)}
                  >
                    <Text style={styles.quickChipText}>{chip.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* 검색 드롭다운 드로어 */}
              {showDropdown ? (
                <View style={styles.dropdownContainer}>
                  {searching ? (
                    <View style={styles.dropdownLoading}>
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                      <Text style={styles.dropdownLoadingText}>카카오 주소를 찾고 있어요…</Text>
                    </View>
                  ) : searchResults.length > 0 ? (
                    <ScrollView style={styles.dropdownList} keyboardShouldPersistTaps="handled">
                      {searchResults.map((item, idx) => (
                        <Pressable
                          key={`${item.addressName}-${idx}`}
                          style={styles.dropdownItem}
                          onPress={() => handleSelectSearchResult(item)}
                        >
                          <Text style={styles.dropdownRoad}>{item.roadAddressName}</Text>
                          {item.buildingName ? (
                            <Text style={styles.dropdownBuilding}>({item.buildingName})</Text>
                          ) : null}
                          <Text style={styles.dropdownRegion}>{item.region}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : (
                    <View style={styles.dropdownEmpty}>
                      <Text style={styles.dropdownEmptyText}>검색 결과가 없어요.</Text>
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          </View>

          {/* 📍 하단 플로팅 선택 지점 카카오 역지오코딩 보드 */}
          <View style={styles.bottomConfirmCard}>
            {pinLoading ? (
              <View style={styles.pinLoadingRow}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={styles.pinLoadingText}>카카오 핀 위치 주소 분석 중…</Text>
              </View>
            ) : pinResult ? (
              <View style={styles.pinResultInfo}>
                <Text style={styles.pinBadge}>📍 선택한 핀 위치 주소</Text>
                <Text style={styles.pinRoadAddress}>
                  {pinResult.roadAddressName}{' '}
                  {pinResult.buildingName ? `(${pinResult.buildingName})` : ''}
                </Text>
                {pinResult.addressName && pinResult.addressName !== pinResult.roadAddressName ? (
                  <Text style={styles.pinJibun}>지번: {pinResult.addressName}</Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.pinRoadAddress}>지도를 이동하여 핀 위치를 지정하세요</Text>
            )}

            <TextInput
              style={styles.detailInput}
              value={detailAddress}
              onChangeText={setDetailAddress}
              placeholder="상세주소 입력 (예: 101동 502호, B동 지하1층)"
              placeholderTextColor={theme.colors.textMuted}
            />

            <Pressable
              accessibilityRole="button"
              style={styles.confirmBtn}
              onPress={handleConfirm}
              disabled={!pinResult}
            >
              <Text style={styles.confirmBtnText}>이 위치로 주소 설정 완료</Text>
            </Pressable>
          </View>
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
    paddingTop: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalTitle: {
    fontSize: font.bodyLarge,
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
  mapViewport: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#EBF3FE',
  },
  webviewMap: {
    flex: 1,
    backgroundColor: '#e5e3df',
  },
  floatingSearchWrap: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 1100,
  },
  floatingSearchBox: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.card,
    padding: 6,
    ...theme.shadow.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  floatingSearchInput: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    fontSize: font.body,
    color: colors.text,
  },
  floatingSearchBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingSearchText: {
    color: '#FFFFFF',
    fontSize: font.body,
    fontWeight: '700',
  },
  quickChipScroll: {
    marginTop: 8,
  },
  quickChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    marginRight: 6,
    ...theme.shadow.card,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  quickChipText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  dropdownContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.card,
    marginTop: 6,
    maxHeight: 220,
    ...theme.shadow.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  dropdownLoading: {
    flexDirection: 'row',
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownLoadingText: {
    marginLeft: spacing.xs,
    color: colors.textMuted,
    fontSize: font.body,
  },
  dropdownList: {
    maxHeight: 220,
  },
  dropdownItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownRoad: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  dropdownBuilding: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '600',
  },
  dropdownRegion: {
    color: colors.textMuted,
    fontSize: font.caption - 1,
    marginTop: 2,
  },
  dropdownEmpty: {
    padding: spacing.md,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    color: colors.textMuted,
    fontSize: font.body,
  },
  bottomConfirmCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: radius.card + 4,
    borderTopRightRadius: radius.card + 4,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...theme.shadow.card,
  },
  pinLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  pinLoadingText: {
    color: colors.textMuted,
    fontSize: font.body,
    marginLeft: spacing.xs,
  },
  pinResultInfo: {
    marginBottom: spacing.xs,
  },
  pinBadge: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '800',
    marginBottom: 2,
  },
  pinRoadAddress: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
  },
  pinJibun: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: 2,
  },
  detailInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: font.body,
    color: colors.text,
    marginVertical: spacing.xs + 2,
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
