import { Router } from 'express';
import {
  CANCELLATION_PENALTY_RATE,
  COMPANY_INFO,
  SALES_PRODUCTS,
  isPurchasable,
  type SalesProduct,
} from '@dimol/shared';

/**
 * 공개 소개 페이지(/landing) — 로그인 없이 누구나 보는 회사·상품 안내.
 *
 * PG(KG이니시스) 가맹 심사가 홈페이지에서 확인하는 것을 한 장에 모았다:
 *  - 판매 상품의 이미지·금액·상세, 무형 서비스의 **제공기간·환불 정책**, 배송 규정
 *  - 하단(푸터)의 사업자 정보·**고객센터 전화번호**·호스팅 서비스 제공자(사업자등록증과 일치)
 *
 * 정적 HTML 로 두지 않고 서버가 그리는 이유: 상품가·사업자 정보가 앱 화면과 이 페이지에
 * 따로 적혀 있으면 한쪽만 고쳐져 어긋난다. 둘 다 `@dimol/shared` 한 곳을 본다.
 */
export function createLandingPageRouter(options: { billingEnabled: boolean }): Router {
  const router = Router();
  router.get('/landing', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(renderLandingPage(SALES_PRODUCTS, options));
  });
  return router;
}

/** HTML 본문·속성에 넣을 문자열 이스케이프. 상품 문구는 코드 상수지만 습관적으로 막는다. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

function renderProduct(p: SalesProduct, purchasable: boolean): string {
  const monthly = p.billingType === 'MONTHLY_SUBSCRIPTION';
  const list = (items: readonly string[]) =>
    items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  return `
  <article class="product" id="product-${escapeHtml(p.id)}">
    <img src="${escapeHtml(p.imagePath)}" alt="${escapeHtml(p.name)} 상품 이미지" width="400" height="400" loading="lazy">
    <div class="product-body">
      <h3>${escapeHtml(p.name)}</h3>
      <p class="price">${won(p.price)}${monthly ? ' <span>/ 월</span>' : ''}</p>
      <p class="desc">${escapeHtml(p.description)}</p>
      <ul class="benefits">${list(p.benefits)}</ul>
      <dl>
        <dt>서비스 제공기간</dt><dd>${escapeHtml(p.servicePeriod.label)}</dd>
        ${monthly ? `<dt>결제 주기</dt><dd>매월 1회 자동결제</dd><dt>해지 방법</dt><dd>${escapeHtml(p.cancellationNotice)}</dd>` : ''}
        <dt>제공 방식</dt><dd>${escapeHtml(p.delivery)}</dd>
        <dt>환불 정책</dt><dd><ul>${list(p.refundPolicy)}</ul></dd>
      </dl>
      ${
        purchasable
          ? `<a class="button" href="/">${monthly ? '앱에서 구독하기' : '앱에서 구매하기'}</a>`
          : '<p class="pending">정기결제 준비 중입니다. 결제가 열리면 앱에서 바로 구독할 수 있습니다.</p>'
      }
    </div>
  </article>`;
}

export function renderLandingPage(
  products: readonly SalesProduct[],
  options: { billingEnabled: boolean },
): string {
  const c = COMPANY_INFO;
  const penalty = Math.round(CANCELLATION_PENALTY_RATE * 100);
  const bizRows: [string, string][] = (
    [
      ['상호', c.name],
      ['대표자', c.representative],
      ['사업자등록번호', c.businessNumber],
      ['통신판매업신고', c.mailOrderNumber],
      ['주소', c.address],
      ['고객센터', c.supportPhone],
      ['이메일', c.email],
      ['개인정보 보호책임자', c.privacyOfficer],
      ['호스팅 서비스', c.hostingProvider],
    ] as [string, string][]
  ).filter(([, v]) => v.length > 0);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="${escapeHtml(c.name)} — 철거현장·운반업체·폐기물 처리장을 연결하는 건설폐기물 매칭 플랫폼 ${escapeHtml(c.serviceName)}">
<title>${escapeHtml(c.name)} — 건설폐기물 매칭 플랫폼 ${escapeHtml(c.serviceName)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap">
<style>
  :root{
    --primary:#1D4ED8;--primary-dark:#163AA3;--primary-soft:#EEF2FC;
    --secondary:#D44A1A;--bg:#F4F3EE;--surface:#fff;--stone:#F9F8F5;
    --text:#17191C;--muted:#54575E;--border:#E6E3DC;--border-strong:#C9C4BA;
    --obsidian:#111315;--obsidian-surface:#1A1D22;--obsidian-border:#262A32;
    --on-dark:#E4E6EA;--on-dark-muted:#A6ACB6;
    --mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Pretendard Variable',Pretendard,-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Segoe UI',sans-serif;background:var(--bg);color:var(--text);font-size:18px;line-height:1.6;-webkit-font-smoothing:antialiased;word-break:keep-all}
  a{color:var(--primary)}
  .mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
  header{background:rgba(17,19,21,0.88);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--obsidian-border);padding:0 24px;position:sticky;top:0;z-index:20}
  .bar{max-width:1120px;margin:0 auto;height:72px;display:flex;align-items:center;justify-content:space-between;gap:16px}
  .logo{font-size:22px;font-weight:800;color:#fff;text-decoration:none;letter-spacing:-0.02em;display:inline-flex;align-items:center;gap:10px}
  .logo small{font-size:15px;color:var(--on-dark-muted);font-weight:500;border-left:1px solid var(--obsidian-border);padding-left:10px}
  nav{display:flex;gap:24px;font-size:16px;font-weight:600;align-items:center}
  nav a{color:var(--on-dark-muted);text-decoration:none;transition:color .16s ease}
  nav a:hover{color:#fff}
  .hero{background:var(--obsidian);color:#fff;padding:64px 24px;border-bottom:1px solid var(--obsidian-border)}
  .hero-grid{max-width:1120px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:40px;align-items:center}
  .hero-eyebrow{color:var(--on-dark-muted);font-size:14px;font-weight:600;letter-spacing:0.06em;margin-bottom:16px}
  .hero h1{font-size:clamp(32px,4.2vw,50px);line-height:1.2;letter-spacing:-0.025em;margin-bottom:16px}
  .hero-lead{max-width:520px;margin-bottom:32px;color:var(--on-dark);font-size:19px;line-height:1.65}
  .hero-cta-row{display:flex;flex-wrap:wrap;gap:12px}
  .button{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 24px;border-radius:6px;background:var(--primary);color:#fff;font-weight:700;text-decoration:none;transition:background-color .16s ease}
  .button:hover{background:var(--primary-dark)}
  .stage-box{background:var(--obsidian-surface);border:1px solid var(--obsidian-border);border-radius:8px;overflow:hidden}
  .stage-top{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--obsidian-border);background:var(--obsidian);color:var(--on-dark-muted);font-size:13px}
  .stage-canvas-wrap{position:relative;height:380px;background:var(--obsidian);background-image:linear-gradient(to right,rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,0.04) 1px,transparent 1px);background-size:48px 48px}
  #landing-3d{display:block;width:100%;height:100%;cursor:grab;touch-action:pan-y}
  #landing-3d:active{cursor:grabbing}
  .stage-fallback{position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:24px;text-align:center;color:var(--on-dark-muted);font-size:15px}
  .stage-tabs{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--obsidian-border);background:var(--obsidian)}
  .stage-tab{appearance:none;background:none;border:0;border-bottom:2px solid transparent;color:var(--on-dark-muted);padding:12px 8px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:background-color .15s ease,color .15s ease,border-color .15s ease}
  .stage-tab:hover{color:#fff;background:rgba(255,255,255,0.03)}
  .stage-tab.is-active{color:#fff;background:var(--obsidian-surface);border-bottom-color:var(--primary)}
  .stage-tab .num{color:#93C5FD;font-size:13px}
  .stage-caption{padding:12px 16px;border-top:1px solid var(--obsidian-border);background:var(--obsidian);color:var(--on-dark);font-size:14px}
  .ledger{background:var(--stone);border-bottom:1px solid var(--border);padding:0 24px}
  .ledger-grid{max-width:1120px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr)}
  .ledger-cell{padding:24px 20px;border-left:1px solid var(--border)}
  .ledger-cell:first-child{border-left:0;padding-left:0}
  .ledger-cell .code{color:var(--primary);font-size:14px;font-weight:700;display:block;margin-bottom:4px}
  .ledger-cell b{display:block;font-size:18px;margin-bottom:2px}
  .ledger-cell span{color:var(--muted);font-size:15px}
  section{max-width:1120px;margin:0 auto;padding:72px 24px}
  .sec-tag{color:var(--primary);font-size:14px;font-weight:700;display:block;margin-bottom:6px}
  h2{font-size:34px;letter-spacing:-0.02em;margin-bottom:8px}
  .lead{color:var(--muted);margin-bottom:32px}
  .steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0;list-style:none;border:1px solid var(--border);border-radius:8px;background:var(--surface);overflow:hidden}
  .steps li{padding:28px 24px;border-left:1px solid var(--border)}
  .steps li:first-child{border-left:0}
  .steps b{display:block;font-size:20px;margin-bottom:8px}
  .products{display:grid;gap:24px}
  .product{display:grid;grid-template-columns:minmax(0,320px) 1fr;gap:28px;background:var(--surface);border:1px solid var(--border-strong);border-radius:8px;padding:28px}
  .product img{width:100%;height:auto;aspect-ratio:1/1;object-fit:cover;border-radius:6px;background:var(--obsidian);border:1px solid var(--obsidian-border);box-shadow:0 12px 30px rgba(17,19,21,0.12)}
  .product h3{font-size:24px}
  .product .desc{color:var(--muted);margin-bottom:12px}
  .price{font-size:32px;font-weight:800;color:var(--primary);font-variant-numeric:tabular-nums;margin:8px 0 12px}
  .price span{font-size:18px;color:var(--muted)}
  .benefits{margin:16px 0 20px 24px}
  .pending{font-weight:700;color:var(--muted)}
  dl{background:var(--stone);border:1px solid var(--border);border-radius:6px;padding:18px;margin-bottom:24px}
  dt{font-weight:700;color:var(--muted)}
  dd{margin:0 0 16px}
  dd:last-child{margin-bottom:0}
  dd ul{margin-left:24px}
  table{width:100%;border-collapse:collapse;background:var(--surface);border-radius:8px;overflow:hidden;border:1px solid var(--border)}
  th,td{padding:18px;text-align:left;border-bottom:1px solid var(--border);vertical-align:top}
  th{background:var(--stone);width:35%}
  footer{background:var(--obsidian);border-top:1px solid var(--obsidian-border);color:var(--on-dark);padding:56px 24px;font-size:16px}
  footer .inner{max-width:1120px;margin:0 auto}
  footer .links{display:flex;flex-wrap:wrap;gap:24px;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--obsidian-border)}
  footer .links a{color:#fff;font-weight:700;text-decoration:none}
  footer dl{background:none;border:none;padding:0;margin:0 0 16px;display:grid;grid-template-columns:max-content 1fr;gap:8px 16px}
  footer dt{color:var(--on-dark-muted);font-weight:400}
  footer dd{margin:0;color:#fff}
  footer .notice{color:var(--on-dark-muted);margin-top:16px}
  @media(max-width:860px){
    .hero-grid{grid-template-columns:1fr}
    .ledger-grid{grid-template-columns:repeat(2,1fr)}
    .ledger-cell{border-left:0;border-top:1px solid var(--border);padding:16px 0}
    .ledger-cell:first-child,.ledger-cell:nth-child(2){border-top:0}
    .steps li{border-left:0;border-top:1px solid var(--border)}
    .steps li:first-child{border-top:0}
  }
  @media(max-width:720px){
    nav{display:none}
    .hero{padding:40px 16px}
    .stage-canvas-wrap{height:260px}
    .product{grid-template-columns:1fr}
    .product img{max-width:320px;margin:0 auto}
    footer dl{grid-template-columns:1fr;gap:0}
    footer dd{margin-bottom:8px}
    th{width:40%}
  }
</style>
</head>
<body>
<header><div class="bar">
  <a class="logo" href="/landing">${escapeHtml(c.serviceName)} <small>by ${escapeHtml(c.name)}</small></a>
  <nav>
    <a href="#how">이용 방법</a>
    <a href="#products">상품·요금</a>
    <a href="#refund">취소·환불</a>
    <a href="/terms">이용약관</a>
  </nav>
</div></header>

<div class="hero">
  <div class="hero-grid">
    <div>
      <div class="hero-eyebrow mono">00 // CONSTRUCTION DEMOLITION &amp; WASTE</div>
      <h1>철거현장 폐기물,<br>업체 매칭부터 처리까지</h1>
      <p class="hero-lead">철거현장(배출자)과 폐기물 운반업체·처리장을 전국 어디서나 연결합니다. 올바로 전자인계서도 자동으로 처리합니다.</p>
      <div class="hero-cta-row">
        <a class="button" href="/">서비스 시작하기</a>
      </div>
    </div>
    <div class="stage-box">
      <div class="stage-top mono">
        <span id="stage-telemetry">STAGE 01 // DEMOLITION SCAN</span>
        <span>드래그하여 회전</span>
      </div>
      <div class="stage-canvas-wrap">
        <canvas id="landing-3d" aria-label="철거·운반·처리장 3D 현장 공정 모형"></canvas>
        <div id="landing-3d-fallback" class="stage-fallback">건축 도면 시뮬레이션 뷰 — WebGL 활성화 환경에서 3D 공정 모형을 회전할 수 있습니다.</div>
      </div>
      <div class="stage-tabs" role="tablist">
        <button type="button" class="stage-tab is-active" data-stage="0"><span class="num mono">01</span>현장 철거</button>
        <button type="button" class="stage-tab" data-stage="1"><span class="num mono">02</span>운반 배차</button>
        <button type="button" class="stage-tab" data-stage="2"><span class="num mono">03</span>처리·올바로</button>
      </div>
      <div class="stage-caption" id="stage-caption">현장 사진·주소 기반 실측 및 철거 범위 확인</div>
    </div>
  </div>
</div>

<div class="ledger">
  <div class="ledger-grid">
    <div class="ledger-cell"><span class="code mono">01</span><b>전국 현장 접수</b><span>지역 제한 없이 직접 등록</span></div>
    <div class="ledger-cell"><span class="code mono">02</span><b>사업자 검증 업체</b><span>허가·보험 확인 후 입점</span></div>
    <div class="ledger-cell"><span class="code mono">03</span><b>올바로 전자인계서</b><span>의무 대상 자동 발행</span></div>
    <div class="ledger-cell"><span class="code mono">04</span><b>배차 전 100% 환불</b><span>배차 이후 위약금 ${penalty}%</span></div>
  </div>
</div>

<section id="how">
  <span class="sec-tag mono">01 // PROCESS</span>
  <h2>이용 방법</h2>
  <p class="lead">건설폐기물(철거현장) 전문 · 사업자 등록 업체만 입점합니다.</p>
  <ol class="steps">
    <li><b>1. 요청 등록</b>현장 주소·폐기물 종류·물량을 입력합니다.</li>
    <li><b>2. 견적 비교</b>인근 운반업체·처리장의 견적을 받아 고릅니다.</li>
    <li><b>3. 선결제</b>운반비+처리비를 계좌이체 또는 카드로 결제합니다.</li>
    <li><b>4. 작업·신고</b>운반·처리 후 전자인계서까지 자동으로 마칩니다.</li>
  </ol>
</section>

<section id="products">
  <span class="sec-tag mono">02 // PRICING</span>
  <h2>상품·요금</h2>
  <p class="lead">아래 상품은 가격이 정해진 상품으로, 대상 회원은 가입 후 앱·웹에서 결제할 수 있습니다.</p>
  <div class="products">${products.map((p) => renderProduct(p, isPurchasable(p, options))).join('')}
  </div>
</section>

<section id="refund">
  <span class="sec-tag mono">03 // POLICY</span>
  <h2>매칭 서비스 결제·취소·환불</h2>
  <p class="lead">철거 폐기물 운반·처리 매칭은 업체 견적에 따라 금액이 정해지며, 매칭이 확정되면 총 금액(운반비+처리비)을 선결제합니다. 작업은 예약일 당일 진행되며, 실물 배송은 없습니다.</p>
  <table>
    <tr><th>배차 전 취소</th><td>전액 환불</td></tr>
    <tr><th>배차 후 ~ 작업 시작 전 취소</th><td>위약금 ${penalty}%를 공제하고 환불</td></tr>
    <tr><th>상차·반출 등 작업 시작 후</th><td>폐기물이 이미 적재·운반되어 원칙적으로 취소가 불가합니다. 업체 귀책(미방문·불이행)이 확인되면 전액 환불합니다.</td></tr>
    <tr><th>환불 방법·기간</th><td>결제한 수단으로 환불됩니다(카드는 승인 취소, 계좌이체는 환불 계좌로 입금). 카드사·은행 사정에 따라 반영까지 며칠 걸릴 수 있습니다.</td></tr>
  </table>
</section>

<footer>
  <div class="inner">
    <div class="links">
      <a href="/terms">이용약관</a>
      <a href="/privacy">개인정보처리방침</a>
      <a href="tel:${escapeHtml(c.supportPhone.replace(/-/g, ''))}">고객센터 ${escapeHtml(c.supportPhone)}</a>
    </div>
    <dl>${bizRows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>
    <p class="notice">${escapeHtml(c.name)}은(는) 통신판매중개자로서 매칭 거래의 당사자가 아니며, 입점 업체가 제공하는 운반·처리 용역에 대한 책임은 해당 업체에 있습니다. 단, 위 상품·요금의 판매자는 ${escapeHtml(c.name)}입니다.</p>
    <p class="notice">© 2026 ${escapeHtml(c.name)}. All rights reserved.</p>
  </div>
</footer>

<script type="importmap">
{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"}}
</script>
<script type="module">
(async function () {
  var META = [
    { tel: 'STAGE 01 // DEMOLITION SCAN', cap: '현장 사진·주소 기반 실측 및 철거 범위 확인' },
    { tel: 'STAGE 02 // ROUTE DISPATCH', cap: '성상별 건설폐기물 분리 적재 및 인근 차주 배차' },
    { tel: 'STAGE 03 // WEIGHBRIDGE', cap: '적법 처리장 계근 반입과 올바로 전자인계서 자동 발행' }
  ];
  var activeStage = 0;
  var telEl = document.getElementById('stage-telemetry');
  var capEl = document.getElementById('stage-caption');
  var tabs = document.querySelectorAll('.stage-tab');
  function setStage(idx) {
    activeStage = idx;
    tabs.forEach(function (btn, i) { btn.classList.toggle('is-active', i === idx); });
    if (telEl) telEl.textContent = META[idx].tel;
    if (capEl) capEl.textContent = META[idx].cap;
  }
  tabs.forEach(function (btn) {
    btn.addEventListener('click', function () { setStage(Number(btn.getAttribute('data-stage')) || 0); });
  });

  var canvas = document.getElementById('landing-3d');
  var fallback = document.getElementById('landing-3d-fallback');
  if (!canvas) return;
  try {
    var THREE = await import('three');
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(7.2, 5.1, 8.4);
    camera.lookAt(0.1, 0.6, 0);

    function resize() {
      var w = Math.max(canvas.clientWidth, 1);
      var h = Math.max(canvas.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }
    resize();
    window.addEventListener('resize', resize);

    scene.add(new THREE.HemisphereLight(0xf3f4f6, 0x111315, 0.9));
    var key = new THREE.DirectionalLight(0xfff5e6, 2.1);
    key.position.set(7, 10, 6);
    key.castShadow = true;
    scene.add(key);
    var rim = new THREE.DirectionalLight(0x60a5fa, 0.8);
    rim.position.set(-6, 4, -5);
    scene.add(rim);

    var root = new THREE.Group();
    scene.add(root);

    function addEdges(mesh, geo, hex, opacity) {
      var edges = new THREE.EdgesGeometry(geo, 24);
      mesh.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: hex, transparent: opacity < 1, opacity: opacity })));
    }

    var plinthGeo = new THREE.BoxGeometry(7.2, 0.14, 4.8);
    var plinth = new THREE.Mesh(plinthGeo, new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.88 }));
    plinth.position.y = -0.07;
    plinth.receiveShadow = true;
    addEdges(plinth, plinthGeo, 0x2c323d, 0.7);
    root.add(plinth);
    root.add(new THREE.GridHelper(6.8, 12, 0x2f3642, 0x1e232c));

    var site = new THREE.Group();
    site.position.set(-1.3, 0, 0.1);
    root.add(site);

    var stoneMat = new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.8 });
    var slateMat = new THREE.MeshStandardMaterial({ color: 0x333944, roughness: 0.55, metalness: 0.4 });
    var blockMat = new THREE.MeshStandardMaterial({ color: 0xd44a1a, roughness: 0.5 });

    var slabGeo = new THREE.BoxGeometry(2.8, 0.1, 2.8);
    var pad = new THREE.Mesh(slabGeo, slateMat);
    pad.position.y = 0.05;
    addEdges(pad, slabGeo, 0x475569, 0.6);
    site.add(pad);

    var upper = new THREE.Group();
    site.add(upper);
    var roofGeo = new THREE.BoxGeometry(2.6, 0.1, 2.6);
    var floor = new THREE.Mesh(roofGeo, stoneMat);
    floor.position.y = 1.05;
    addEdges(floor, roofGeo, 0x475569, 0.5);
    upper.add(floor);
    var roof = new THREE.Mesh(roofGeo, stoneMat);
    roof.position.y = 2.05;
    addEdges(roof, roofGeo, 0x64748b, 0.65);
    upper.add(roof);

    var colGeo = new THREE.BoxGeometry(0.14, 1.95, 0.14);
    [[-1.15,-1.15],[1.15,-1.15],[-1.15,1.15],[1.15,1.15]].forEach(function (c) {
      var col = new THREE.Mesh(colGeo, stoneMat);
      col.position.set(c[0], 1.02, c[1]);
      site.add(col);
    });

    var scanMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.24, side: THREE.DoubleSide });
    var scanPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.9), scanMat);
    scanPlane.rotation.x = -Math.PI / 2;
    site.add(scanPlane);

    var blocks = [];
    for (var b = 0; b < 4; b++) {
      var bGeo = new THREE.BoxGeometry(0.65, 0.5, 0.25);
      var bMesh = new THREE.Mesh(bGeo, b % 2 === 0 ? stoneMat : blockMat);
      addEdges(bMesh, bGeo, 0x475569, 0.5);
      bMesh.userData = {
        sitePos: new THREE.Vector3(-0.4 + (b % 2) * 0.8, 0.4 + Math.floor(b / 2) * 0.9, (b % 2 - 0.5) * 0.7),
        stagedPos: new THREE.Vector3(0.8 + b * 0.42, 0.26, 1.85)
      };
      site.add(bMesh);
      blocks.push(bMesh);
    }

    var plant = new THREE.Group();
    plant.position.set(1.9, 0, -0.45);
    root.add(plant);
    var plantGeo = new THREE.BoxGeometry(2.1, 0.1, 2.5);
    var plantPad = new THREE.Mesh(plantGeo, slateMat);
    plantPad.position.y = 0.05;
    addEdges(plantPad, plantGeo, 0x475569, 0.6);
    plant.add(plantPad);
    var siloGeo = new THREE.CylinderGeometry(0.38, 0.38, 1.75, 20);
    [-0.4, 0.42].forEach(function (sx) {
      var silo = new THREE.Mesh(siloGeo, slateMat);
      silo.position.set(sx, 0.95, -0.45);
      addEdges(silo, siloGeo, 0x64748b, 0.4);
      plant.add(silo);
    });
    var ringMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0, side: THREE.DoubleSide });
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.52, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.16, 0.55);
    plant.add(ring);

    var curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.3, 0.22, 1.75),
      new THREE.Vector3(0.6, 0.75, 1.15),
      new THREE.Vector3(1.9, 0.22, 0.05)
    ]);
    var tubeMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0 });
    var tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.025, 8, false), tubeMat);
    root.add(tube);
    var carrier = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.24), new THREE.MeshStandardMaterial({ color: 0x1d4ed8 }));
    root.add(carrier);

    var dragging = false, lastX = 0, lastY = 0, targetYaw = -0.42, targetPitch = 0.12, yaw = -0.42, pitch = 0.12;
    canvas.addEventListener('pointerdown', function (e) { dragging = true; lastX = e.clientX; lastY = e.clientY; });
    window.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      targetYaw += (e.clientX - lastX) * 0.008;
      targetPitch = Math.max(-0.2, Math.min(0.45, targetPitch + (e.clientY - lastY) * 0.005));
      lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('pointerup', function () { dragging = false; });

    var s0 = 1, s1 = 0, s2 = 0, prog = 0, last = performance.now();
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function frame(now) {
      var dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
      last = now;
      var elapsed = now * 0.001;
      var dmp = 1 - Math.exp(-5.5 * Math.max(dt, 0.016));
      s0 += ((activeStage === 0 ? 1 : 0) - s0) * dmp;
      s1 += ((activeStage === 1 ? 1 : 0) - s1) * dmp;
      s2 += ((activeStage === 2 ? 1 : 0) - s2) * dmp;
      if (!dragging) targetYaw = -0.42 + Math.sin(elapsed * 0.28) * 0.08;
      yaw += (targetYaw - yaw) * dmp;
      pitch += (targetPitch - pitch) * dmp;
      root.rotation.y = yaw; root.rotation.x = pitch;
      upper.position.y = s0 * 0.35;
      scanPlane.position.y = 0.2 + ((Math.sin(elapsed * 1.4) + 1) * 0.5) * 1.85;
      scanMat.opacity = s0 * 0.24; scanPlane.visible = s0 > 0.02;
      blocks.forEach(function (bm) {
        bm.position.lerpVectors(bm.userData.sitePos, bm.userData.stagedPos, s1);
        var sc = s2 > 0.5 ? Math.max(1 - s2, 0.001) : 1;
        bm.scale.setScalar(sc); bm.visible = sc > 0.03;
      });
      tubeMat.opacity = s1 * 0.7; tube.visible = s1 > 0.02;
      carrier.visible = s1 > 0.04;
      if (carrier.visible) {
        prog = (prog + dt * 0.25) % 1;
        var p = curve.getPointAt(prog);
        carrier.position.copy(p);
        carrier.lookAt(p.clone().add(curve.getTangentAt(prog)));
      }
      ring.visible = s2 > 0.02;
      if (ring.visible) {
        var pls = (elapsed * 0.85) % 1;
        ring.scale.setScalar(0.8 + pls * 0.9);
        ringMat.opacity = s2 * (1 - pls) * 0.75;
      }
      renderer.render(scene, camera);
      if (!reduced) window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  } catch (e) {
    if (fallback) fallback.style.display = 'flex';
  }
})();
</script>
</body>
</html>`;
}
