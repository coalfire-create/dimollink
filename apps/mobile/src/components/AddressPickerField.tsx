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
  WEB_BASE_URL,
  coord2Address,
  searchAddress,
  type AddressSearchResult,
} from '../api/client';
import { AppIcon } from './AppIcon';
import { FieldError } from './ui';
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
  /** 검증 오류 문구 — 있으면 입력 테두리가 오류색이 되고 아래에 문구가 붙는다. */
  error?: string | null;
}

interface MapFrameProps {
  /** 서버가 서빙하는 지도 페이지 URL. srcDoc 이 아니라 실제 URL 이어야 한다. */
  mapUrl: string;
  iframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  webViewRef: React.MutableRefObject<WebView | null>;
  onNativeMessage: (event: WebViewMessageEvent) => void;
}

// 🗺 지도 DOM(iframe / WebView) 리로드 방지를 위한 메모이제이션 래퍼
const MapFrame = React.memo(
  function MapFrame({ mapUrl, iframeRef, webViewRef, onNativeMessage }: MapFrameProps) {
    if (Platform.OS === 'web') {
      return (
        <iframe
          ref={iframeRef}
          src={mapUrl}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          title="지도"
          allow="geolocation"
        />
      );
    }
    return (
      <WebView
        ref={webViewRef}
        source={{ uri: mapUrl }}
        originWhitelist={['*']}
        style={styles.webviewMap}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled
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
  placeholder = '지도에서 현장 위치를 선택하세요',
  hint,
  error,
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
  // 지도를 잡고 움직이는 중 — 이때 주소는 아직 확정이 아니라 흐리게 보여준다.
  const [pinMoving, setPinMoving] = useState(false);
  const [locateDenied, setLocateDenied] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const webViewRef = useRef<WebView | null>(null);
  const lastHandledCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  // 자동검색 콜백에서 panMapTo 를 부르기 위한 우회(선언 순서상 직접 참조 불가).
  const panMapToRef = useRef<((lat: number, lng: number) => void) | null>(null);
  // 지도에 보내려는 목표 좌표. 지도(iframe/WebView)가 아직 로딩 중이면 이동 요청이
  // 그대로 사라지므로, 도달을 확인할 때까지 들고 있다가 재전송한다.
  const panTargetRef = useRef<{ lat: number; lng: number; tries: number } | null>(null);
  // 결과를 눌러 채워진 검색어 — 이 값에는 자동 재검색을 걸지 않는다.
  const lastAppliedQueryRef = useRef<string>('');

  /** 지도에 이동 명령을 실제로 전달한다. 지도가 아직 안 떴으면 아무 일도 일어나지 않는다. */
  const sendPanToMap = useCallback((lat: number, lng: number) => {
    if (Platform.OS === 'web') {
      iframeRef.current?.contentWindow?.postMessage({ type: 'PAN_TO', lat, lng }, '*');
    } else {
      webViewRef.current?.injectJavaScript(
        `window.__panTo && window.__panTo(${lat}, ${lng}); true;`,
      );
    }
  }, []);

  // 지도 핀 위치가 이동했을 때 역지오코딩 호출 (동일 좌표 중복 호출 방지)
  // force=true 면 중복 방지를 건너뛴다(실패 후 "다시 시도").
  const handleMapMove = useCallback(async (lat: number, lng: number, force = false) => {
    // 아직 목표에 닿지 않았다면, 지도가 이제 막 준비됐다는 뜻이므로 다시 보낸다.
    // (모달을 열자마자 주소를 입력하면 첫 요청이 로딩 중인 지도에 닿지 않는다)
    const target = panTargetRef.current;
    if (target) {
      const reached = Math.abs(lat - target.lat) < 1e-4 && Math.abs(lng - target.lng) < 1e-4;
      if (reached) {
        panTargetRef.current = null;
      } else if (target.tries < 3) {
        panTargetRef.current = { ...target, tries: target.tries + 1 };
        sendPanToMap(target.lat, target.lng);
        return; // 곧 바뀔 좌표라 역지오코딩하지 않는다(불필요한 호출·깜빡임 방지)
      } else {
        panTargetRef.current = null; // 재시도 상한 — 현재 위치로 진행
      }
    }

    if (
      !force &&
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
      // 좌표를 주소인 것처럼 보여주지 않는다. 확정하지 못했다는 사실을 그대로 알린다.
      setPinResult({
        addressName: '',
        roadAddressName: '',
        region: '',
        location: { lat, lng },
        approximate: true,
      });
    } finally {
      setPinLoading(false);
    }
  }, []);

  /** 지도 문서가 보내오는 메시지를 한 곳에서 해석한다(웹 iframe / 네이티브 WebView 공통). */
  const handleMapEvent = useCallback(
    (data: { type?: string; lat?: number; lng?: number }) => {
      if (data.type === 'MAP_MOVING') {
        // 핀이 떠 있는 동안은 주소가 확정되지 않았다는 뜻.
        setPinMoving(true);
        return;
      }
      if (data.type === 'LOCATE_DENIED') {
        setLocateDenied(true);
        return;
      }
      if (
        data.type === 'MAP_MOVED' &&
        typeof data.lat === 'number' &&
        typeof data.lng === 'number'
      ) {
        setPinMoving(false);
        void handleMapMove(data.lat, data.lng);
      }
    },
    [handleMapMove],
  );

  // Native WebView 메시지 핸들러
  const handleNativeMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        handleMapEvent(JSON.parse(event.nativeEvent.data));
      } catch {
        // 무시: 지도 외 메시지
      }
    },
    [handleMapEvent],
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
  // 목표를 기록해 두고 보낸다 — 지도가 아직 로딩 중이면 이번 전송은 사라지지만,
  // 지도가 준비되며 올라오는 첫 MAP_MOVED 에서 재전송된다.
  function panMapTo(lat: number, lng: number) {
    setMapLat(lat);
    setMapLng(lng);
    panTargetRef.current = { lat, lng, tries: 0 };
    sendPanToMap(lat, lng);
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

  // 주소를 확정하지 못한 결과(키 없음·API 실패)는 그대로 현장 주소로 쓸 수 없다.
  // 권역이라도 알아냈으면 상세주소를 받아 진행하고, 그마저 없으면 확정을 막는다.
  const unresolved = !!pinResult?.approximate;
  const hasRegion = !!pinResult?.region;
  const needsDetail = unresolved && hasRegion;
  const canConfirm =
    !!pinResult &&
    !pinMoving &&
    !pinLoading &&
    hasRegion &&
    (!needsDetail || detailAddress.trim().length > 0);

  function handleConfirm() {
    if (!canConfirm || !pinResult) return;
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
      if (e.data && typeof e.data === 'object') handleMapEvent(e.data);
    }

    window.addEventListener('message', handleWebMessage);
    return () => {
      window.removeEventListener('message', handleWebMessage);
    };
  }, [modalVisible, handleMapEvent]);

  // 지도 페이지 URL — 서버가 카카오 키를 심어 서빙한다.
  // srcDoc(문자열)로 넣으면 문서 URL 이 about:srcdoc 이 되어 카카오 SDK 가
  // 내부 리소스를 http 로 불러오다 Mixed Content 로 차단된다. 실제 URL 이어야 한다.
  const mapUrl = useMemo(
    () => `${WEB_BASE_URL}/map?lat=${DEFAULT_CENTER.lat}&lng=${DEFAULT_CENTER.lng}`,
    [],
  );

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Pressable accessibilityRole="button" style={styles.searchBtn} onPress={handleOpenModal}>
          <AppIcon name="location" size={18} color={theme.colors.primary} />
          <Text style={styles.searchBtnText}>지도에서 선택</Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        style={[styles.fieldInput, error ? styles.fieldInputError : null]}
        onPress={handleOpenModal}
      >
        <Text style={value ? styles.inputText : styles.placeholderText} numberOfLines={2}>
          {value || placeholder}
        </Text>
      </Pressable>
      {error ? (
        <FieldError message={error} />
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}

      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalScreen}>
          {/* 상단 닫기 모달 헤더 */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>현장 위치 선택</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="닫기"
              onPress={() => setModalVisible(false)}
              style={styles.closeBtn}
              hitSlop={8}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* 🗺 카카오택시 스타일 전면 지도 영역 */}
          <View style={styles.mapViewport}>
            <MapFrame
              mapUrl={mapUrl}
              iframeRef={iframeRef}
              webViewRef={webViewRef}
              onNativeMessage={handleNativeMessage}
            />

            {/* 🔍 상단 플로팅 주소/건물명 검색바 */}
            <View style={styles.floatingSearchWrap}>
              <View style={styles.floatingSearchBox}>
                <View style={styles.searchIcon}>
                  <AppIcon name="location" size={20} color={theme.colors.textMuted} />
                </View>
                <TextInput
                  style={styles.floatingSearchInput}
                  value={query}
                  onChangeText={(text) => {
                    setQuery(text);
                    if (!text.trim()) setShowDropdown(false);
                  }}
                  placeholder="도로명, 건물명, 지번으로 검색"
                  placeholderTextColor={theme.colors.textMuted}
                  returnKeyType="search"
                  onSubmitEditing={() => handleSearch()}
                />
                {searching ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primary}
                    style={styles.searchSpinner}
                  />
                ) : query ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="검색어 지우기"
                    style={styles.clearBtn}
                    onPress={() => {
                      setQuery('');
                      setShowDropdown(false);
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.clearBtnText}>✕</Text>
                  </Pressable>
                ) : null}
              </View>

              {/* 검색 드롭다운 드로어 */}
              {showDropdown ? (
                <View style={styles.dropdownContainer}>
                  {searchResults.length > 0 ? (
                    <ScrollView style={styles.dropdownList} keyboardShouldPersistTaps="handled">
                      {searchResults.map((item, idx) => (
                        <Pressable
                          key={`${item.addressName}-${idx}`}
                          style={styles.dropdownItem}
                          onPress={() => handleSelectSearchResult(item)}
                        >
                          <Text style={styles.dropdownRoad} numberOfLines={1}>
                            {item.roadAddressName}
                            {item.buildingName ? (
                              <Text style={styles.dropdownBuilding}> · {item.buildingName}</Text>
                            ) : null}
                          </Text>
                          <Text style={styles.dropdownRegion} numberOfLines={1}>
                            {item.addressName}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : !searching ? (
                    <View style={styles.dropdownEmpty}>
                      <Text style={styles.dropdownEmptyText}>검색 결과가 없어요.</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          {/*
            하단 확정 시트.
            주소 영역은 최소 높이를 고정한다 — 로딩/결과/2줄 주소를 오갈 때 시트가
            들썩이면 아래 버튼 위치가 흔들려 오조작으로 이어진다.
          */}
          <View style={styles.bottomConfirmCard}>
            <View style={styles.sheetHandle} />

            <View style={styles.pinResultInfo}>
              <Text style={styles.pinBadge}>선택한 위치</Text>
              {pinResult && unresolved ? (
                <>
                  <Text style={styles.pinRoadAddress} numberOfLines={2}>
                    {hasRegion ? `${pinResult.region} 일대` : '주소를 확인하지 못했어요'}
                  </Text>
                  <Text style={styles.pinNotice} numberOfLines={2}>
                    {hasRegion
                      ? '정확한 주소를 찾지 못했어요. 아래에 상세주소를 입력해 주세요.'
                      : '잠시 후 다시 시도하거나 위에서 주소를 검색해 주세요.'}
                  </Text>
                  {!hasRegion ? (
                    <Pressable
                      accessibilityRole="button"
                      style={styles.retryBtn}
                      onPress={() => void handleMapMove(mapLat, mapLng, true)}
                    >
                      <Text style={styles.retryBtnText}>다시 시도</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : pinResult ? (
                <>
                  <Text
                    style={[styles.pinRoadAddress, pinMoving && styles.pinAddressPending]}
                    numberOfLines={2}
                  >
                    {pinResult.roadAddressName || pinResult.addressName}
                    {pinResult.buildingName ? (
                      <Text style={styles.pinBuilding}> · {pinResult.buildingName}</Text>
                    ) : null}
                  </Text>
                  {pinResult.addressName && pinResult.addressName !== pinResult.roadAddressName ? (
                    <Text
                      style={[styles.pinJibun, pinMoving && styles.pinAddressPending]}
                      numberOfLines={1}
                    >
                      지번 {pinResult.addressName}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.pinPlaceholder} numberOfLines={2}>
                  지도를 움직여 현장 위치를 맞춰주세요
                </Text>
              )}
            </View>

            {locateDenied ? (
              <Text style={styles.locateDeniedText}>
                위치 권한이 꺼져 있어요. 검색으로 찾거나 지도를 직접 움직여주세요.
              </Text>
            ) : null}

            <TextInput
              style={[styles.detailInput, needsDetail && styles.detailInputRequired]}
              value={detailAddress}
              onChangeText={setDetailAddress}
              placeholder={
                needsDetail ? '상세주소를 입력해 주세요 (필수)' : '상세주소 (예: 101동 502호)'
              }
              placeholderTextColor={theme.colors.textMuted}
            />

            <Pressable
              accessibilityRole="button"
              style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!canConfirm}
            >
              <Text style={[styles.confirmBtnText, !canConfirm && styles.confirmBtnTextDisabled]}>
                {pinMoving || pinLoading
                  ? '위치를 확인하는 중…'
                  : needsDetail && !detailAddress.trim()
                    ? '상세주소를 입력해 주세요'
                    : '이 위치로 설정'}
              </Text>
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
    paddingVertical: spacing.xs,
    borderRadius: radius.button,
  },
  searchBtnText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
    marginLeft: spacing.xs / 2,
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
  fieldInputError: {
    borderColor: theme.colors.error,
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs,
  },
  modalScreen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.lg,
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
    backgroundColor: theme.colors.primarySoft,
  },
  webviewMap: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  floatingSearchWrap: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    zIndex: 1100,
  },
  // 지도 위에 뜨는 요소는 테두리 대신 그림자로 띄운다(지도와 경계가 자연스럽다).
  floatingSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.button,
    paddingHorizontal: spacing.xs + 4,
    minHeight: theme.touch.minButtonHeight + 8,
    ...theme.shadow.card,
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 5,
  },
  searchIcon: {
    marginRight: spacing.xs / 2,
  },
  floatingSearchInput: {
    flex: 1,
    paddingHorizontal: spacing.xs / 2,
    paddingVertical: spacing.xs,
    fontSize: font.body,
    color: colors.text,
  },
  searchSpinner: {
    marginHorizontal: spacing.xs,
  },
  clearBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
    lineHeight: font.caption,
  },
  dropdownContainer: {
    backgroundColor: colors.background,
    borderRadius: radius.button,
    marginTop: spacing.xs,
    maxHeight: 264,
    ...theme.shadow.card,
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 5,
    overflow: 'hidden',
  },
  dropdownList: {
    maxHeight: 220,
  },
  dropdownItem: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: theme.touch.minButtonHeight,
    justifyContent: 'center',
  },
  dropdownRoad: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  dropdownBuilding: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '600',
  },
  dropdownRegion: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 4,
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
  // 시트를 잡을 수 있는 것처럼 보이게 하는 손잡이 — 하단 시트의 관례.
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.xs + 4,
  },
  // 로딩/1줄/2줄 주소를 오가도 시트 높이가 변하지 않도록 최소 높이를 잡는다.
  pinResultInfo: {
    minHeight: 88,
    justifyContent: 'center',
    marginBottom: spacing.xs / 2,
  },
  pinBadge: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
    marginBottom: spacing.xs / 2,
  },
  pinRoadAddress: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    lineHeight: font.title + 8,
  },
  pinBuilding: {
    color: colors.primary,
    fontSize: font.title,
    fontWeight: '800',
  },
  // 지도가 움직이는 동안의 주소는 아직 확정이 아니다 — 흐리게 보여 준다.
  pinAddressPending: {
    opacity: 0.35,
  },
  pinPlaceholder: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '600',
    lineHeight: font.bodyLarge + 8,
  },
  pinJibun: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
  },
  locateDeniedText: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginBottom: spacing.xs / 2,
  },
  pinNotice: {
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
  // 비활성 상태가 눈에 보여야 한다 — 눌리지 않는데 멀쩡해 보이면 고장으로 읽힌다.
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
