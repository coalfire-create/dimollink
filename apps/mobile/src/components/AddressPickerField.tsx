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
import {
  coord2Address,
  getPublicConfig,
  searchAddress,
  type AddressSearchResult,
} from '../api/client';
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

  // 지도 공급자 설정 — 키가 확정되기 전에는 지도를 만들지 않는다.
  // (MapFrame 이 리렌더를 막으므로 키가 늦게 오면 영영 반영되지 않기 때문)
  const [kakaoJsKey, setKakaoJsKey] = useState<string | null>(null);
  const [mapConfigReady, setMapConfigReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void getPublicConfig().then((cfg) => {
      if (!alive) return;
      setKakaoJsKey(cfg.kakaoJsKey);
      setMapConfigReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const webViewRef = useRef<WebView | null>(null);
  const lastHandledCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  // 자동검색 콜백에서 panMapTo 를 부르기 위한 우회(선언 순서상 직접 참조 불가).
  const panMapToRef = useRef<((lat: number, lng: number) => void) | null>(null);
  // 결과를 눌러 채워진 검색어 — 이 값에는 자동 재검색을 걸지 않는다.
  const lastAppliedQueryRef = useRef<string>('');

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

  /**
   * 주소/건물명 검색. moveToFirst 면 첫 결과 위치로 지도를 바로 옮긴다.
   * 사용자가 주소를 치는 목적은 "그 위치를 보는 것"이므로, 목록에서 한 번 더
   * 고르게 하지 않고 가장 그럴듯한 결과로 먼저 이동시킨 뒤 목록을 함께 보여준다.
   */
  const handleSearch = useCallback(
    async (searchQuery?: string, options: { moveToFirst?: boolean } = {}) => {
      const q = (searchQuery ?? query).trim();
      if (!q) {
        setShowDropdown(false);
        setSearchResults([]);
        return;
      }
      setSearching(true);
      try {
        const res = await searchAddress(q);
        setSearchResults(res);
        setShowDropdown(res.length > 0);
        const first = res.find((r) => r.location);
        if (options.moveToFirst && first?.location) {
          panMapToRef.current?.(first.location.lat, first.location.lng);
        }
      } catch {
        setSearchResults([]);
        setShowDropdown(false);
      } finally {
        setSearching(false);
      }
    },
    [query],
  );

  // 입력이 멈추면 자동으로 검색하고 지도를 옮긴다(검색 버튼을 누르지 않아도 되게).
  useEffect(() => {
    if (!modalVisible) return;
    const q = query.trim();
    // 너무 짧은 입력은 의미 있는 결과가 안 나오고 호출만 늘어난다.
    if (q.length < 2) return;
    // 결과를 눌러 채워진 값(이미 그 위치로 이동함)에는 다시 검색하지 않는다.
    if (q === lastAppliedQueryRef.current) return;
    const timer = setTimeout(() => {
      void handleSearch(q, { moveToFirst: true });
    }, 500);
    return () => clearTimeout(timer);
  }, [query, modalVisible, handleSearch]);

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
  panMapToRef.current = panMapTo;

  // 검색 결과 클릭 시 지도를 해당 위치로 이동 (Pan To)
  function handleSelectSearchResult(item: AddressSearchResult) {
    setShowDropdown(false);
    const picked = item.roadAddressName || item.addressName;
    setQuery(picked);
    // 방금 고른 값으로 자동 재검색이 돌지 않도록 표시해 둔다.
    lastAppliedQueryRef.current = picked;

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

  // 지도 HTML — 설정(카카오 키) 확정 후 한 번만 생성한다.
  // MapFrame 이 리렌더를 막고 있으므로, 여기서 만든 문자열이 그 세션의 지도 전부다.
  const mapHtml = useMemo(
    () => buildMapHtml(kakaoJsKey, DEFAULT_CENTER),
    [kakaoJsKey],
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
            {mapConfigReady ? (
              <MapFrame
                mapHtml={mapHtml}
                iframeRef={iframeRef}
                webViewRef={webViewRef}
                onNativeMessage={handleNativeMessage}
              />
            ) : (
              <View style={styles.mapLoading}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.mapLoadingText}>지도를 불러오는 중…</Text>
              </View>
            )}

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

/** 지도 위 고정 핀·확대버튼 등 두 지도 구현이 공유하는 오버레이 스타일. */
const MAP_SHARED_CSS = `
  html, body, #map { width:100%; height:100%; margin:0; padding:0; overflow:hidden;
    background:#e5e3df; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .center-pin-wrap { position:absolute; top:50%; left:50%; transform:translate(-50%,-100%);
    z-index:1000; pointer-events:none; display:flex; flex-direction:column; align-items:center; }
  .center-pin-emoji { font-size:42px; line-height:1;
    filter:drop-shadow(0 6px 8px rgba(0,0,0,0.35)); animation:bouncePin 1.2s infinite ease-in-out alternate; }
  .center-pin-shadow { width:16px; height:6px; background:rgba(0,0,0,0.25); border-radius:50%; margin-top:-4px; }
  @keyframes bouncePin { from { transform:translateY(0); } to { transform:translateY(-6px); } }
  .leaflet-control-zoom { margin-bottom:90px !important; margin-right:16px !important; }
  #fallback-note { position:absolute; left:8px; bottom:8px; z-index:1000; max-width:70%;
    background:rgba(0,0,0,0.6); color:#fff; font-size:11px; line-height:1.4;
    padding:6px 8px; border-radius:6px; }
`;

/**
 * 지도 HTML 생성.
 *
 * 카카오 JS 키가 있으면 카카오 지도를 쓴다 — 국내 건물 형상·상호·번지 라벨이 그대로 나와
 * 철거 현장을 찍을 때 "그 건물이 맞는지" 눈으로 확인할 수 있다.
 * 키가 없으면 OpenStreetMap 표준 타일로 폴백한다(키 불필요, 다만 국내 POI 는 빈약).
 */
export function buildMapHtml(
  kakaoJsKey: string | null,
  center: { lat: number; lng: number },
): string {
  // OSM 폴백은 키 유무와 무관하게 항상 심는다. 카카오 키가 있어도 도메인 미등록·네트워크
  // 차단으로 SDK 가 안 뜨면 지도가 통째로 빈 화면이 되는데, 그때 조용히 대체하기 위해서다.
  const script = `
    var mapApi = null;          // { setCenter(lat,lng), getCenter() } — 준비된 지도 구현
    var pendingCenter = null;   // 지도가 뜨기 전 들어온 이동 요청

    function emitMoved() {
      if (!mapApi) return;
      var c = mapApi.getCenter();
      var payload = { type: 'MAP_MOVED', lat: c.lat, lng: c.lng };
      if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*');
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
    var moveTimer = null;
    function scheduleMoved() {
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(emitMoved, 200);
    }

    /** 지도 구현이 준비되면 호출 — 대기 중이던 이동 요청을 흘려보낸다. */
    function setMapApi(api) {
      mapApi = api;
      if (pendingCenter) {
        var p = pendingCenter;
        pendingCenter = null;
        api.setCenter(p.lat, p.lng);
      }
      scheduleMoved();
    }

    // 앱 ↔ 지도 공통 인터페이스. 구현이 무엇이든 이 함수만 쓰면 된다.
    window.__panTo = function(lat, lng) {
      if (mapApi) mapApi.setCenter(lat, lng);
      else pendingCenter = { lat: lat, lng: lng };
    };
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'PAN_TO') window.__panTo(e.data.lat, e.data.lng);
    });

    function startOsm(note) {
      if (mapApi) return;
      document.getElementById('map').innerHTML = '';
      var map = L.map('map', { zoomControl: false }).setView([${center.lat}, ${center.lng}], 17);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap'
      }).addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      map.on('moveend', scheduleMoved);
      if (note) {
        var n = document.createElement('div');
        n.id = 'fallback-note';
        n.textContent = note;
        document.body.appendChild(n);
      }
      setMapApi({
        setCenter: function(lat, lng) { map.setView([lat, lng], map.getZoom(), { animate: true }); },
        getCenter: function() { var c = map.getCenter(); return { lat: c.lat, lng: c.lng }; },
      });
    }
    ${
      kakaoJsKey
        ? `
    function startKakao() {
      if (!window.kakao || !window.kakao.maps) return;
      kakao.maps.load(function() {
        if (mapApi) return; // 이미 폴백이 떴으면 덮지 않는다
        var map = new kakao.maps.Map(document.getElementById('map'), {
          center: new kakao.maps.LatLng(${center.lat}, ${center.lng}),
          level: 3, // 건물 상호가 보이는 축척
        });
        map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.BOTTOMRIGHT);
        kakao.maps.event.addListener(map, 'idle', scheduleMoved);
        setMapApi({
          setCenter: function(lat, lng) { map.panTo(new kakao.maps.LatLng(lat, lng)); },
          getCenter: function() { var c = map.getCenter(); return { lat: c.getLat(), lng: c.getLng() }; },
        });
      });
    }
    startKakao();
    // SDK 가 안 뜨거나 load 콜백이 오지 않으면(도메인 미등록 등) 조용히 OSM 으로 대체.
    setTimeout(function() {
      startOsm('카카오 지도를 불러오지 못했어요. 간략 지도로 표시합니다. (JS 키·허용 도메인 확인)');
    }, 3500);`
        : `startOsm('간략 지도예요. 건물·상호까지 보려면 카카오 지도 키가 필요합니다.');`
    }
  `;

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    ${kakaoJsKey ? `<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoJsKey}&autoload=false"></script>` : ''}
    <style>${MAP_SHARED_CSS}</style>
    </head><body>
    <div id="map"></div>
    <div class="center-pin-wrap"><div class="center-pin-emoji">📍</div><div class="center-pin-shadow"></div></div>
    <script>${script}</script></body></html>`;
}

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
  mapLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
  },
  mapLoadingText: {
    color: theme.colors.textMuted,
    fontSize: theme.font.caption,
    marginTop: theme.spacing.sm,
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
