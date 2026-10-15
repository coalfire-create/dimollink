import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { GeoPoint } from '@dimol/shared';
import {
  WEB_BASE_URL,
  coord2Address,
  searchAddress,
  type AddressSearchResult,
} from '../../api/client';

/**
 * 지도 주소 선택의 동작 전부 — 지도와 주고받는 메시지, 역지오코딩, 검색, 확정 규칙.
 *
 * 이 화면이 까다로운 이유는 **지도가 다른 문서**(웹 iframe / 네이티브 WebView)라는 점이다.
 * 이동 명령을 보내도 지도가 아직 로딩 중이면 그대로 사라지고, 반대로 사용자가 지도를
 * 잡고 움직이는 동안에는 좌표가 계속 올라온다. 그래서 여기서 세 가지를 관리한다:
 *  - 목표 좌표를 들고 있다가 도달을 확인할 때까지 재전송(panTarget)
 *  - 같은 좌표에 대한 역지오코딩 중복 호출 차단(lastHandledCoords)
 *  - 지도를 움직이는 중에는 주소를 "확정되지 않음"으로 표시(pinMoving)
 */

// 지도 초기 중심 좌표(분당 정자동). 지도 HTML 은 이 값으로 한 번만 생성되며,
// 이후 핀 이동은 사용자 조작/PAN_TO 로만 처리한다(상태를 HTML 에 되먹이면 리로드 루프 발생).
const DEFAULT_CENTER = { lat: 37.3613376, lng: 127.1055431 };

/** 지도가 목표에 닿았다고 볼 오차(약 10m). */
const REACHED_EPSILON = 1e-4;
/** 같은 자리로 보는 오차 — 이보다 작게 움직이면 역지오코딩을 다시 하지 않는다. */
const SAME_SPOT_EPSILON = 0.00005;
/** 이동 명령 재전송 상한. 이보다 많이 놓치면 현재 위치로 진행한다. */
const MAX_PAN_RETRIES = 3;

export function useAddressPicker(
  onChangeAddress: (address: string, region: string, location?: GeoPoint) => void,
) {
  const [modalVisible, setModalVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AddressSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // 지도 중심 핀 좌표.
  const [mapLat, setMapLat] = useState(DEFAULT_CENTER.lat);
  const [mapLng, setMapLng] = useState(DEFAULT_CENTER.lng);

  // 역지오코딩 결과.
  const [pinResult, setPinResult] = useState<AddressSearchResult | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinMoving, setPinMoving] = useState(false);
  const [detailAddress, setDetailAddress] = useState('');
  const [locateDenied, setLocateDenied] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const webViewRef = useRef<WebView | null>(null);
  const lastHandledCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  // 자동검색 콜백에서 panMapTo 를 부르기 위한 우회(선언 순서상 직접 참조 불가).
  const panMapToRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const panTargetRef = useRef<{ lat: number; lng: number; tries: number } | null>(null);
  // 결과를 눌러 채워진 검색어 — 이 값에는 자동 재검색을 걸지 않는다.
  const lastAppliedQueryRef = useRef('');

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

  /**
   * 핀이 멈춘 자리의 주소를 받아온다.
   * force=true 면 중복 방지를 건너뛴다(실패 후 "다시 시도").
   */
  const handleMapMove = useCallback(
    async (lat: number, lng: number, force = false) => {
      // 아직 목표에 닿지 않았다면, 지도가 이제 막 준비됐다는 뜻이므로 다시 보낸다.
      // (모달을 열자마자 주소를 입력하면 첫 요청이 로딩 중인 지도에 닿지 않는다)
      const target = panTargetRef.current;
      if (target) {
        const reached =
          Math.abs(lat - target.lat) < REACHED_EPSILON &&
          Math.abs(lng - target.lng) < REACHED_EPSILON;
        if (reached) {
          panTargetRef.current = null;
        } else if (target.tries < MAX_PAN_RETRIES) {
          panTargetRef.current = { ...target, tries: target.tries + 1 };
          sendPanToMap(target.lat, target.lng);
          return; // 곧 바뀔 좌표라 역지오코딩하지 않는다(불필요한 호출·깜빡임 방지).
        } else {
          panTargetRef.current = null; // 재시도 상한 — 현재 위치로 진행.
        }
      }

      const last = lastHandledCoordsRef.current;
      if (
        !force &&
        last &&
        Math.abs(last.lat - lat) < SAME_SPOT_EPSILON &&
        Math.abs(last.lng - lng) < SAME_SPOT_EPSILON
      ) {
        return;
      }
      lastHandledCoordsRef.current = { lat, lng };

      setMapLat(lat);
      setMapLng(lng);
      setPinLoading(true);
      try {
        setPinResult(await coord2Address(lat, lng));
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
    },
    [sendPanToMap],
  );

  /** 지도 문서가 보내오는 메시지를 한 곳에서 해석한다(웹 iframe / 네이티브 WebView 공통). */
  const handleMapEvent = useCallback(
    (data: { type?: string; lat?: number; lng?: number }) => {
      if (data.type === 'MAP_MOVING') {
        setPinMoving(true); // 핀이 떠 있는 동안은 주소가 확정되지 않았다는 뜻.
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

  const handleNativeMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        handleMapEvent(JSON.parse(event.nativeEvent.data));
      } catch {
        // 무시: 지도 외 메시지.
      }
    },
    [handleMapEvent],
  );

  /**
   * 주소·건물명 검색. moveToFirst 면 첫 결과 위치로 지도를 바로 옮긴다.
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
        const results = await searchAddress(q);
        setSearchResults(results);
        setShowDropdown(results.length > 0);
        const first = results.find((r) => r.location);
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
    const timer = setTimeout(() => void handleSearch(q, { moveToFirst: true }), 500);
    return () => clearTimeout(timer);
  }, [query, modalVisible, handleSearch]);

  /**
   * 지도를 특정 좌표로 이동시킨다. 목표를 기록해 두고 보낸다 — 지도가 아직 로딩 중이면
   * 이번 전송은 사라지지만, 지도가 준비되며 올라오는 첫 MAP_MOVED 에서 재전송된다.
   */
  function panMapTo(lat: number, lng: number) {
    setMapLat(lat);
    setMapLng(lng);
    panTargetRef.current = { lat, lng, tries: 0 };
    sendPanToMap(lat, lng);
  }
  panMapToRef.current = panMapTo;

  function selectSearchResult(item: AddressSearchResult) {
    setShowDropdown(false);
    const picked = item.roadAddressName || item.addressName;
    setQuery(picked);
    // 방금 고른 값으로 자동 재검색이 돌지 않도록 표시해 둔다.
    lastAppliedQueryRef.current = picked;
    if (item.location) {
      // 검색 결과는 이미 확정된 주소다 — 지도가 옮겨진 뒤 알려 주기를 기다리지 않고 바로 고른다.
      // 지도가 늦게 뜨거나(느린 망) 아예 못 뜨면(카카오 장애) 결과를 눌러도 "주소를 확인하지
      // 못했어요"에 머물러 신청을 못 했다. 같은 좌표로 기록해 두어 지도가 그 자리에 도착했을 때
      // 역지오코딩으로 덮어쓰지 않는다(검색 결과 쪽이 도로명·건물명까지 있어 더 정확하다).
      // 사용자가 지도를 끌어 옮기면 그때는 새 좌표라 평소대로 다시 확인한다.
      lastHandledCoordsRef.current = { lat: item.location.lat, lng: item.location.lng };
      setPinResult(item);
      panMapTo(item.location.lat, item.location.lng);
    }
  }

  function changeQuery(text: string) {
    setQuery(text);
    if (!text.trim()) setShowDropdown(false);
  }

  function openModal() {
    setModalVisible(true);
    if (!pinResult) void handleMapMove(mapLat, mapLng);
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

  function confirm() {
    if (!canConfirm || !pinResult) return;
    const baseAddress = pinResult.roadAddressName || pinResult.addressName;
    // 건물명이 주소에 이미 들어 있으면 또 붙이지 않는다.
    const building =
      pinResult.buildingName && !baseAddress.includes(pinResult.buildingName)
        ? ` (${pinResult.buildingName})`
        : '';
    const detail = detailAddress.trim() ? ` ${detailAddress.trim()}` : '';

    onChangeAddress(
      `${baseAddress}${building}${detail}`,
      pinResult.region,
      pinResult.location ?? { lat: mapLat, lng: mapLng },
    );
    setModalVisible(false);
    setDetailAddress('');
  }

  // 웹(iframe)은 postMessage 로 올라온다 — 모달이 열려 있을 때만 듣는다.
  useEffect(() => {
    if (Platform.OS !== 'web' || !modalVisible) return;
    function onMessage(event: MessageEvent) {
      if (event.data && typeof event.data === 'object') handleMapEvent(event.data);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [modalVisible, handleMapEvent]);

  const mapUrl = useMemo(
    () => `${WEB_BASE_URL}/map?lat=${DEFAULT_CENTER.lat}&lng=${DEFAULT_CENTER.lng}`,
    [],
  );

  return {
    modalVisible,
    openModal,
    closeModal: () => setModalVisible(false),
    mapUrl,
    iframeRef,
    webViewRef,
    handleNativeMessage,
    // 검색
    query,
    changeQuery,
    searching,
    searchResults,
    showDropdown,
    runSearch: () => void handleSearch(),
    selectSearchResult,
    // 핀
    pinResult,
    pinLoading,
    pinMoving,
    locateDenied,
    retry: () => void handleMapMove(mapLat, mapLng, true),
    // 확정
    detailAddress,
    setDetailAddress,
    needsDetail,
    hasRegion,
    canConfirm,
    confirm,
  };
}
