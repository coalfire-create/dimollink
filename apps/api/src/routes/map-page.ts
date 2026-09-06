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
    // 디몰비전 등 허용된 외부 오리진이 이 지도를 iframe 으로 쓸 수 있게 한다.
    // frame-ancestors 가 지정되면 최신 브라우저는 X-Frame-Options 를 무시하므로,
    // 외부 허용이 있을 때는 CSP 만 두어 둘이 충돌하지 않게 한다.
    const ancestors = ["'self'", ...env.mapFrameAncestors];
    if (env.mapFrameAncestors.length === 0) {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }
    res.setHeader('Content-Security-Policy', `frame-ancestors ${ancestors.join(' ')}`);
    // 카카오/OSM 타일을 받아야 하므로 same-site 로 묶인 리소스 정책을 이 문서에서만 푼다.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(renderMapPage(env.publicConfig.kakaoJsKey ?? null, center));
  });

  return router;
}

/** 브랜드 메인 컬러 — packages/shared 의 COLORS.primary 와 같은 값. */
const PIN_COLOR = '#2C55E9';

/**
 * 핀은 이모지가 아니라 SVG 로 그린다. 이모지는 OS·폰트마다 모양이 달라 통제가 안 되고,
 * 크기를 키우면 가장자리가 뭉개진다.
 *
 * 움직임 규칙(카카오T·우버 등이 쓰는 방식):
 *  - 지도를 잡고 움직이는 동안 핀이 살짝 떠오르고 그림자는 작아진다 → "떼어낸" 느낌
 *  - 손을 떼면 살짝 튕기며 내려앉는다 → 위치가 확정됐다는 신호
 * 상시 반복되는 bounce 애니메이션은 시선을 계속 끌어 오히려 싸구려로 보이므로 쓰지 않는다.
 */
const SHARED_CSS = `
  html, body, #map { width:100%; height:100%; margin:0; padding:0; overflow:hidden;
    background:#e5e3df; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans KR",sans-serif; }
  * { -webkit-tap-highlight-color:transparent; }

  /* 지도 정중앙의 0x0 기준점. 핀 끝과 그림자가 모두 이 점에 정렬된다. */
  .pin-anchor { position:absolute; left:50%; top:50%; width:0; height:0; z-index:1000;
    pointer-events:none; }

  /* 핀 본체 — bottom:0 이라 뾰족한 끝이 정확히 기준점에 닿는다. */
  .pin-body { position:absolute; bottom:0; left:50%; width:34px; height:46px; margin-left:-17px;
    transform:translateY(0); transform-origin:50% 100%;
    transition:transform .32s cubic-bezier(.22,1.4,.4,1);
    filter:drop-shadow(0 4px 6px rgba(16,32,72,.28)); }
  .pin-anchor.is-moving .pin-body { transform:translateY(-14px); }

  /* 지면 그림자 — 핀이 뜨면 작고 진해진다.
     핀이 떠 있는 동안에는 이 그림자가 곧 "정확히 여기" 를 가리키는 지점 표시가 된다.
     별도의 점을 겹쳐 그리면 축소된 그림자를 덮어 버려 높이 단서가 사라진다. */
  .pin-shadow { position:absolute; left:50%; top:0; width:20px; height:7px; margin-left:-10px;
    margin-top:-3.5px; border-radius:50%; background:rgba(16,32,72,.30);
    transition:transform .32s cubic-bezier(.22,1.4,.4,1), background .32s ease; }
  .pin-anchor.is-moving .pin-shadow { transform:scale(.5); background:rgba(16,32,72,.55); }

  /* 지도 위 컨트롤 — 터치 영역 48px 규칙을 지킨다. */
  .map-controls { position:absolute; right:16px; bottom:24px; z-index:1000;
    display:flex; flex-direction:column; gap:8px; }
  .map-btn { width:48px; height:48px; padding:0; border:none; cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    background:#fff; border-radius:14px; color:#1A1A1A;
    box-shadow:0 2px 10px rgba(16,32,72,.18); transition:transform .12s ease, background .12s ease; }
  .map-btn:active { transform:scale(.94); background:#F1F3F7; }
  .map-btn[disabled] { opacity:.45; cursor:default; }
  .map-btn.is-active { color:${PIN_COLOR}; }
  /* 확대/축소는 한 덩어리로 묶어 지도 앱의 관례를 따른다. */
  .map-zoom { display:flex; flex-direction:column; background:#fff; border-radius:14px;
    box-shadow:0 2px 10px rgba(16,32,72,.18); overflow:hidden; }
  .map-zoom .map-btn { border-radius:0; box-shadow:none; }
  .map-zoom .map-btn + .map-btn { border-top:1px solid #E7EAF1; }

  /* 기본 줌 컨트롤은 우리 버튼과 중복되므로 숨긴다. */
  .leaflet-control-zoom, .leaflet-control-attribution { display:none !important; }

  #fallback-note { position:absolute; left:16px; right:80px; bottom:24px; z-index:1000;
    background:rgba(16,32,72,.82); color:#fff; font-size:15px; line-height:1.45;
    padding:8px 12px; border-radius:10px; }
`;

/** 지도 중앙 핀 마크업. */
const PIN_HTML = `
<div class="pin-anchor" id="pin">
  <div class="pin-shadow"></div>
  <div class="pin-body">
    <svg width="34" height="46" viewBox="0 0 34 46" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 0C7.6 0 0 7.6 0 17c0 11.9 15.1 27.4 15.8 28a1.8 1.8 0 0 0 2.5 0C18.9 44.4 34 28.9 34 17 34 7.6 26.4 0 17 0z" fill="${PIN_COLOR}"/>
      <circle cx="17" cy="16.6" r="6.2" fill="#fff"/>
    </svg>
  </div>
</div>`;

const ICON_LOCATE = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M12 1.5v3M12 19.5v3M22.5 12h-3M4.5 12h-3"/></svg>`;
const ICON_PLUS = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
const ICON_MINUS = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>`;

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
        kakao.maps.event.addListener(map, 'dragstart', markMoving);
        kakao.maps.event.addListener(map, 'zoom_start', markMoving);
        kakao.maps.event.addListener(map, 'idle', function() { markSettled(); scheduleMoved(); });
        setMapApi({
          setCenter: function(lat, lng) { map.panTo(new kakao.maps.LatLng(lat, lng)); },
          getCenter: function() { var c = map.getCenter(); return { lat: c.getLat(), lng: c.getLng() }; },
          // 카카오는 level 이 낮을수록 확대다.
          zoomBy: function(d) { map.setLevel(map.getLevel() - d, { animate: true }); }
        });
      });
    }
    startKakao();
    setTimeout(function() {
      startOsm('지도를 간략 모드로 표시하고 있어요. 위치 선택은 그대로 됩니다.');
    }, 4000);`
    : `startOsm('지도를 간략 모드로 표시하고 있어요. 위치 선택은 그대로 됩니다.');`;

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<title>지도</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
${kakaoJsKey ? `<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(kakaoJsKey)}&autoload=false"></script>` : ''}
<style>${SHARED_CSS}</style>
</head><body>
<div id="map"></div>
${PIN_HTML}
<div class="map-controls">
  <button type="button" class="map-btn" id="btn-locate" aria-label="현재 위치로 이동">${ICON_LOCATE}</button>
  <div class="map-zoom">
    <button type="button" class="map-btn" id="btn-zoom-in" aria-label="확대">${ICON_PLUS}</button>
    <button type="button" class="map-btn" id="btn-zoom-out" aria-label="축소">${ICON_MINUS}</button>
  </div>
</div>
<script>
  var mapApi = null;        // 준비된 지도 구현 { setCenter, getCenter, zoomBy }
  var pendingCenter = null; // 지도가 뜨기 전 들어온 이동 요청
  var pinEl = document.getElementById('pin');

  function post(payload) {
    if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*');
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }

  // 핀을 띄운다. 지도가 움직이는 동안 앱은 주소 텍스트를 흐리게 처리한다.
  var moving = false;
  var settleGuard = null;
  function markMoving() {
    // 안전장치: 이동 종료 이벤트가 끝내 오지 않는 경우에도 핀이 뜬 채로 굳으면 안 된다.
    // (예: 이미 그 좌표에 있는데 panTo 를 부르면 leaflet 은 moveend 를 주지 않는다.
    //  그대로 두면 앱의 "이 위치로 설정" 버튼이 영영 비활성으로 남는다.)
    if (settleGuard) clearTimeout(settleGuard);
    settleGuard = setTimeout(function() { markSettled(); scheduleMoved(); }, 2500);
    if (moving) return;
    moving = true;
    pinEl.classList.add('is-moving');
    post({ type: 'MAP_MOVING' });
  }
  function markSettled() {
    if (settleGuard) { clearTimeout(settleGuard); settleGuard = null; }
    if (!moving) return;
    moving = false;
    pinEl.classList.remove('is-moving');
  }

  function emitMoved() {
    if (!mapApi) return;
    var c = mapApi.getCenter();
    post({ type: 'MAP_MOVED', lat: c.lat, lng: c.lng });
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
    if (mapApi) { markMoving(); mapApi.setCenter(lat, lng); }
    else pendingCenter = { lat: lat, lng: lng };
  };
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'PAN_TO') window.__panTo(e.data.lat, e.data.lng);
  });

  document.getElementById('btn-zoom-in').onclick = function() { mapApi && mapApi.zoomBy(1); };
  document.getElementById('btn-zoom-out').onclick = function() { mapApi && mapApi.zoomBy(-1); };

  // 현재 위치 — 지도 문서 안에서 호출해야 iframe/WebView 권한이 정상 동작한다.
  var locateBtn = document.getElementById('btn-locate');
  if (!navigator.geolocation) {
    locateBtn.disabled = true;
  } else {
    locateBtn.onclick = function() {
      if (locateBtn.disabled) return;
      locateBtn.disabled = true;
      locateBtn.classList.add('is-active');
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          locateBtn.disabled = false;
          locateBtn.classList.remove('is-active');
          window.__panTo(pos.coords.latitude, pos.coords.longitude);
        },
        function() {
          locateBtn.disabled = false;
          locateBtn.classList.remove('is-active');
          post({ type: 'LOCATE_DENIED' });
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    };
  }

  function startOsm(note) {
    if (mapApi) return;
    document.getElementById('map').innerHTML = '';
    var map = L.map('map', { zoomControl: false, attributionControl: false })
      .setView([${center.lat}, ${center.lng}], 17);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    map.on('movestart zoomstart', markMoving);
    map.on('moveend', function() { markSettled(); scheduleMoved(); });
    if (note) {
      var n = document.createElement('div');
      n.id = 'fallback-note'; n.textContent = note;
      document.body.appendChild(n);
    }
    setMapApi({
      setCenter: function(lat, lng) { map.setView([lat, lng], map.getZoom(), { animate: true }); },
      getCenter: function() { var c = map.getCenter(); return { lat: c.lat, lng: c.lng }; },
      zoomBy: function(d) { d > 0 ? map.zoomIn() : map.zoomOut(); }
    });
  }
  ${kakaoBlock}
</script></body></html>`;
}
