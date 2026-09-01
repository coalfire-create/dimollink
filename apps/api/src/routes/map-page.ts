import { Router } from 'express';
import { env } from '../config/env.js';

/**
 * 지도 페이지 — 앱의 주소 선택 화면이 iframe/WebView 로 띄우는 실제 HTML.
 *
 * 왜 앱에서 문자열로 만들지 않고 서버가 URL 로 서빙하는가:
 * 카카오 지도 SDK 는 내부 리소스를 `location.protocol` 기준으로 불러온다. iframe 을
 * srcDoc 으로 채우면 그 문서의 URL 이 `about:srcdoc` 이라 프로토콜이 http 로 풀리고,
 * HTTPS 페이지에서 Mixed Content 로 차단돼 지도가 뜨지 않는다.
 * 실제 https URL 로 서빙하면 프로토콜이 정상이고, 카카오 콘솔의 허용 도메인 검사도
 * 우리 도메인으로 통과한다. JS 키가 앱 번들에 박히지 않는 장점도 있다.
 */
export function createMapPageRouter(): Router {
  const router = Router();

  router.get('/map', (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const center = {
      lat: Number.isFinite(lat) ? lat : 37.5665,
      lng: Number.isFinite(lng) ? lng : 126.978,
    };
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // 키가 바뀌면 즉시 반영돼야 하므로 캐시하지 않는다(문서 자체는 작다).
    res.setHeader('Cache-Control', 'no-cache');
    // 전역 보안 헤더는 X-Frame-Options: DENY 다. 이 문서만 앱이 iframe 으로 띄워야 하므로
    // 동일 출처 프레이밍만 허용한다(외부 사이트의 클릭재킹은 계속 차단).
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    // 카카오/OSM 타일을 받아야 하므로 same-site 로 묶인 리소스 정책을 이 문서에서만 푼다.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(renderMapPage(env.publicConfig.kakaoJsKey ?? null, center));
  });

  return router;
}

const SHARED_CSS = `
  html, body, #map { width:100%; height:100%; margin:0; padding:0; overflow:hidden;
    background:#e5e3df; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .center-pin-wrap { position:absolute; top:50%; left:50%; transform:translate(-50%,-100%);
    z-index:1000; pointer-events:none; display:flex; flex-direction:column; align-items:center; }
  .center-pin-emoji { font-size:42px; line-height:1;
    filter:drop-shadow(0 6px 8px rgba(0,0,0,0.35)); animation:bouncePin 1.2s infinite ease-in-out alternate; }
  .center-pin-shadow { width:16px; height:6px; background:rgba(0,0,0,0.25); border-radius:50%; margin-top:-4px; }
  @keyframes bouncePin { from { transform:translateY(0); } to { transform:translateY(-6px); } }
  .leaflet-control-zoom { margin-bottom:90px !important; margin-right:16px !important; }
  #fallback-note { position:absolute; left:8px; bottom:26px; z-index:1000; max-width:70%;
    background:rgba(0,0,0,0.6); color:#fff; font-size:11px; line-height:1.4;
    padding:6px 8px; border-radius:6px; }
`;

/**
 * 지도 HTML.
 * 카카오 키가 있으면 카카오 지도(국내 건물 형상·상호·번지 라벨)를 쓰고,
 * 키가 없거나 SDK 초기화가 실패하면 OpenStreetMap 표준 타일로 조용히 대체한다.
 */
export function renderMapPage(
  kakaoJsKey: string | null,
  center: { lat: number; lng: number },
): string {
  const kakaoBlock = kakaoJsKey
    ? `
    function startKakao() {
      if (!window.kakao || !window.kakao.maps) return;
      kakao.maps.load(function() {
        if (mapApi) return; // 폴백이 먼저 떴으면 덮지 않는다
        var map = new kakao.maps.Map(document.getElementById('map'), {
          center: new kakao.maps.LatLng(${center.lat}, ${center.lng}),
          level: 3
        });
        map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.BOTTOMRIGHT);
        kakao.maps.event.addListener(map, 'idle', scheduleMoved);
        setMapApi({
          setCenter: function(lat, lng) { map.panTo(new kakao.maps.LatLng(lat, lng)); },
          getCenter: function() { var c = map.getCenter(); return { lat: c.getLat(), lng: c.getLng() }; }
        });
      });
    }
    startKakao();
    setTimeout(function() {
      startOsm('카카오 지도를 불러오지 못했어요. 간략 지도로 표시합니다. (JS 키·허용 도메인 확인)');
    }, 4000);`
    : `startOsm('간략 지도예요. 건물·상호까지 보려면 카카오 지도 키가 필요합니다.');`;

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<title>지도</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
${kakaoJsKey ? `<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(kakaoJsKey)}&autoload=false"></script>` : ''}
<style>${SHARED_CSS}</style>
</head><body>
<div id="map"></div>
<div class="center-pin-wrap"><div class="center-pin-emoji">📍</div><div class="center-pin-shadow"></div></div>
<script>
  var mapApi = null;        // 준비된 지도 구현 { setCenter, getCenter }
  var pendingCenter = null; // 지도가 뜨기 전 들어온 이동 요청

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
  function setMapApi(api) {
    mapApi = api;
    if (pendingCenter) { var p = pendingCenter; pendingCenter = null; api.setCenter(p.lat, p.lng); }
    scheduleMoved();
  }
  // 앱 ↔ 지도 공통 인터페이스
  window.__panTo = function(lat, lng) {
    if (mapApi) mapApi.setCenter(lat, lng); else pendingCenter = { lat: lat, lng: lng };
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
      n.id = 'fallback-note'; n.textContent = note;
      document.body.appendChild(n);
    }
    setMapApi({
      setCenter: function(lat, lng) { map.setView([lat, lng], map.getZoom(), { animate: true }); },
      getCenter: function() { var c = map.getCenter(); return { lat: c.lat, lng: c.lng }; }
    });
  }
  ${kakaoBlock}
</script></body></html>`;
}
