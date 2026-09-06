import { Router } from 'express';

/**
 * 3D 스캔 뷰어 페이지 — 앱이 WebView 로 띄우는 실제 HTML.
 *
 * React Native 는 3D Gaussian Splatting 을 직접 렌더링하지 못한다. 지도 페이지와 같은
 * 이유로(`map-page.ts`) 서버가 실제 URL 로 서빙하고 WebView 가 그 URL 을 연다 —
 * srcDoc 으로 채우면 문서 URL 이 `about:srcdoc` 이라 상대 경로·프로토콜이 깨진다.
 *
 * 장면 파일(.ply/.splat)은 presigned URL 로 받아 쿼리로 넘긴다. 파일이 수십 MB 라
 * 페이지에 인라인하지 않는다.
 */
export function createScanViewerPageRouter(): Router {
  const router = Router();

  router.get('/scan-viewer', (req, res) => {
    const sceneUrl = typeof req.query.scene === 'string' ? req.query.scene : '';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    // 전역 보안 헤더는 X-Frame-Options: DENY — 이 문서만 동일 출처 프레이밍을 허용한다.
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(renderScanViewerPage(sceneUrl));
  });

  return router;
}

/** 장면 URL 을 HTML 속성/JS 문자열에 안전하게 넣는다(스크립트 주입 차단). */
export function escapeForJs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\r?\n/g, '');
}

/**
 * 뷰어 HTML.
 *
 * 장면이 아직 없을 때(복원 중·실패)도 빈 화면이 아니라 상태를 보여준다 —
 * 복원은 20~40분 걸리므로 "아직 준비 중"이 정상 상태다.
 */
export function renderScanViewerPage(sceneUrl: string): string {
  const scene = escapeForJs(sceneUrl);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>현장 3D 보기</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; background: #101418; }
  #canvas { display: block; width: 100%; height: 100%; touch-action: none; }
  .panel {
    position: absolute; left: 16px; right: 16px; bottom: 16px;
    background: rgba(0,0,0,0.72); color: #fff; border-radius: 12px; padding: 16px;
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif;
  }
  .panel h1 { font-size: 18px; margin: 0 0 8px; font-weight: 800; }
  .panel p { margin: 0; color: #D1D5DB; }
  .hint { position: absolute; top: 16px; left: 16px; right: 16px;
    background: rgba(0,0,0,0.55); color: #E5E7EB; border-radius: 12px; padding: 12px 16px;
    font: 16px/1.4 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif; }
  [hidden] { display: none !important; }
  .measure {
    position: absolute; left: 16px; right: 16px; bottom: 16px;
    background: rgba(20,40,90,0.92); color: #fff; border-radius: 12px; padding: 16px;
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif;
  }
  .measure p { margin: 0 0 12px; }
  button {
    width: 100%; min-height: 48px; border: 0; border-radius: 12px;
    background: #2C55E9; color: #fff; font-size: 16px; font-weight: 700;
  }
  #measureStart {
    position: absolute; left: 16px; right: 16px; bottom: 16px; width: auto;
  }
</style>
</head>
<body>
<canvas id="canvas"></canvas>
<div class="hint" id="hint" hidden>한 손가락으로 돌리고, 두 손가락으로 확대·이동하세요.</div>
<div class="measure" id="measure" hidden>
  <p id="measureText">크기를 아는 물건의 <b>양 끝</b>을 차례로 두 번 누르세요.</p>
  <button type="button" id="measureCancel">측정 취소</button>
</div>
<button type="button" id="measureStart" hidden>기준 물체로 크기 재기</button>
<div class="panel" id="panel">
  <h1 id="panelTitle">3D 복원을 준비하고 있어요</h1>
  <p id="panelBody">촬영한 영상으로 입체 모형을 만드는 중입니다. 20~40분 걸립니다.</p>
</div>

<script type="importmap">
{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"}}
</script>
<script type="module">
(function () {
  var SCENE_URL = "${scene}";
  var panel = document.getElementById('panel');
  var panelTitle = document.getElementById('panelTitle');
  var panelBody = document.getElementById('panelBody');
  var hint = document.getElementById('hint');

  function status(title, body) {
    panelTitle.textContent = title;
    panelBody.textContent = body;
    panel.hidden = false;
  }

  // 앱(WebView)에서 상태를 밀어넣을 수 있게 한다 — 복원 진행률 표시용.
  window.setScanStatus = status;

  if (!SCENE_URL) {
    // 장면이 아직 없는 것은 오류가 아니라 정상 상태다(복원에 20~40분).
    return;
  }

  var canvas = document.getElementById('canvas');
  // ⚠️ 지원 검사는 반드시 **버리는 캔버스**로 한다. 렌더 캔버스에서 getContext 를 먼저
  //    부르면 그 컨텍스트를 점유해버려, 뷰어(three.js)가 자기 컨텍스트를 만들지 못하고
  //    장면 로드가 조용히 멈춘다.
  var probe = document.createElement('canvas');
  var gl = probe.getContext('webgl2') || probe.getContext('webgl');
  if (!gl) {
    status('이 기기에서는 3D를 볼 수 없어요', '사진과 분석 결과는 그대로 확인하실 수 있습니다.');
    return;
  }

  status('장면을 불러오는 중', '잠시만 기다려 주세요.');

  // 3DGS 렌더러는 CDN 에서 ESM 으로 로드한다(번들에 넣기엔 크다 — 620KB).
  //
  // ⚠️ UMD 빌드(.cjs)를 쓰면 안 된다. jsDelivr 가 .cjs 를 'application/node' +
  //    'nosniff' 로 서빙해서 브라우저가 스크립트 실행을 거부한다(로드가 조용히 실패).
  //    .module.js 는 'application/javascript' 로 와서 정상 동작한다.
  // ⚠️ three 는 importmap 으로 미리 매핑해야 한다 — 라이브러리가 'three' 를 import 한다.
  import('https://cdn.jsdelivr.net/npm/@mkkellogg/gaussian-splats-3d@0.4.6/build/gaussian-splats-3d.module.js')
    .then(function (GS) {
      if (!GS || typeof GS.Viewer !== 'function') {
        status('3D 뷰어를 불러오지 못했어요', '잠시 후 다시 시도해 주세요.');
        return;
      }
      var viewer = new GS.Viewer({
        canvas: canvas,
        cameraUp: [0, -1, 0],
        initialCameraPosition: [0, 0, -8],
        initialCameraLookAt: [0, 0, 0],
        sharedMemoryForWorkers: false
      });
      return viewer.addSplatScene(SCENE_URL, { showLoadingUI: false }).then(function () {
        panel.hidden = true;
        hint.hidden = false;
        viewer.start();
        setupMeasure(viewer);
      });
    })
    .catch(function () {
      status('장면을 여는 데 실패했어요', '복원이 아직 끝나지 않았거나 네트워크 문제일 수 있습니다.');
    });

  /**
   * 기준 물체 측정 — 3D 장면에서 두 점을 찍어 그 사이 거리를 잰다.
   *
   * 이 거리는 복원 좌표계 단위다. 앱이 "이건 A4 긴 변 0.297m" 같은 실제 길이와 나누면
   * 배율이 나오고, 부피는 배율의 세제곱으로 재계산된다 — **복원 재실행은 필요 없다.**
   */
  function setupMeasure(viewer) {
    var startBtn = document.getElementById('measureStart');
    var box = document.getElementById('measure');
    var text = document.getElementById('measureText');
    var cancel = document.getElementById('measureCancel');
    var picked = [];
    var active = false;

    // 레이캐스팅을 못 쓰는 빌드면 측정 버튼 자체를 띄우지 않는다(먹통 버튼 금지).
    if (!viewer.raycaster || typeof viewer.raycaster.setFromCameraAndScreenPosition !== 'function') {
      return;
    }
    startBtn.hidden = false;

    startBtn.onclick = function () {
      active = true;
      picked = [];
      startBtn.hidden = true;
      box.hidden = false;
      text.innerHTML = '크기를 아는 물건의 <b>양 끝</b>을 차례로 두 번 누르세요.';
    };
    cancel.onclick = function () {
      active = false;
      picked = [];
      box.hidden = true;
      startBtn.hidden = false;
    };

    canvas.addEventListener('pointerdown', function (event) {
      if (!active) return;
      var point = pick(viewer, event);
      if (!point) {
        text.textContent = '그 지점에서는 표면을 찾지 못했어요. 물체 표면을 눌러 주세요.';
        return;
      }
      picked.push(point);
      if (picked.length === 1) {
        text.textContent = '반대쪽 끝을 눌러 주세요.';
        return;
      }
      var dx = picked[0].x - picked[1].x;
      var dy = picked[0].y - picked[1].y;
      var dz = picked[0].z - picked[1].z;
      var distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      active = false;
      box.hidden = true;
      startBtn.hidden = false;
      // 앱(WebView)이 받아 실제 길이와 나눠 배율을 만든다.
      postToApp({ type: 'REFERENCE_MEASURED', measuredUnits: distance });
    });
  }

  /** 화면 좌표 → 장면 표면의 3D 점. 못 찾으면 null. */
  function pick(viewer, event) {
    try {
      var rect = canvas.getBoundingClientRect();
      var position = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      viewer.raycaster.setFromCameraAndScreenPosition(viewer.camera, position, {
        x: rect.width,
        y: rect.height
      });
      var hits = viewer.raycaster.intersectSplatMesh(viewer.splatMesh, []);
      var hit = hits && hits[0];
      return hit && hit.origin ? hit.origin : null;
    } catch (e) {
      return null;
    }
  }

  function postToApp(message) {
    var payload = JSON.stringify(message);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
    else window.parent.postMessage(payload, '*');
  }
})();
</script>
</body>
</html>`;
}
