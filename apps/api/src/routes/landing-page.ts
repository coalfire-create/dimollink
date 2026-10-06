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
      <p>${escapeHtml(p.description)}</p>
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
<style>
  :root{--primary:#2C55E9;--primary-soft:#EAEFFD;--bg:#F5F7FB;--surface:#fff;--text:#1E293B;--muted:#526077;--border:#E2E8F0}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Segoe UI',sans-serif;background:var(--bg);color:var(--text);font-size:18px;line-height:1.6}
  a{color:var(--primary)}
  header{background:var(--surface);border-bottom:1px solid var(--border);padding:0 16px}
  .bar{max-width:1040px;margin:0 auto;height:64px;display:flex;align-items:center;justify-content:space-between;gap:16px}
  .logo{font-size:24px;font-weight:800;color:var(--primary);text-decoration:none}
  nav{display:flex;gap:24px;font-size:18px}
  nav a{color:var(--text);text-decoration:none}
  .hero{background:var(--primary);color:#fff;padding:64px 16px;text-align:center}
  .hero h1{font-size:clamp(28px,5vw,48px);line-height:1.25;margin-bottom:16px}
  .hero p{max-width:640px;margin:0 auto 32px;opacity:.92}
  .button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 24px;border-radius:12px;background:var(--primary);color:#fff;font-weight:700;text-decoration:none}
  .hero .button{background:#fff;color:var(--primary)}
  section{max-width:1040px;margin:0 auto;padding:64px 16px}
  h2{font-size:32px;margin-bottom:8px}
  .lead{color:var(--muted);margin-bottom:32px}
  .steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;list-style:none}
  .steps li{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px}
  .steps b{display:block;font-size:20px;margin-bottom:8px}
  .products{display:grid;gap:24px}
  .product{display:grid;grid-template-columns:minmax(0,320px) 1fr;gap:24px;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px}
  .product img{width:100%;height:auto;border-radius:16px;background:var(--primary-soft)}
  .product h3{font-size:24px}
  .price{font-size:32px;font-weight:800;color:var(--primary);margin:8px 0 16px}
  .price span{font-size:18px;color:var(--muted)}
  .benefits{margin:16px 0 16px 24px}
  .pending{font-weight:700;color:var(--muted)}
  dl{background:var(--bg);border-radius:12px;padding:16px;margin-bottom:24px}
  dt{font-weight:700;color:var(--muted)}
  dd{margin:0 0 16px}
  dd:last-child{margin-bottom:0}
  dd ul{margin-left:24px}
  table{width:100%;border-collapse:collapse;background:var(--surface);border-radius:16px;overflow:hidden;border:1px solid var(--border)}
  th,td{padding:16px;text-align:left;border-bottom:1px solid var(--border);vertical-align:top}
  th{background:var(--primary-soft);width:35%}
  footer{background:#1E293B;color:#CBD5E1;padding:48px 16px;font-size:16px}
  footer .inner{max-width:1040px;margin:0 auto}
  footer .links{display:flex;flex-wrap:wrap;gap:24px;margin-bottom:24px}
  footer .links a{color:#fff;font-weight:700}
  footer dl{background:none;padding:0;margin:0 0 16px;display:grid;grid-template-columns:max-content 1fr;gap:8px 16px}
  footer dt{color:#94A3B8;font-weight:400}
  footer dd{margin:0;color:#fff}
  footer .notice{color:#94A3B8;margin-top:16px}
  @media(max-width:720px){
    nav{display:none}
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
  <a class="logo" href="/landing">${escapeHtml(c.serviceName)} <small style="font-size:16px;color:var(--muted)">by ${escapeHtml(c.name)}</small></a>
  <nav>
    <a href="#how">이용 방법</a>
    <a href="#products">상품·요금</a>
    <a href="#refund">취소·환불</a>
    <a href="/terms">이용약관</a>
  </nav>
</div></header>

<div class="hero">
  <h1>철거현장 폐기물,<br>업체 매칭부터 처리까지</h1>
  <p>철거현장(배출자)과 폐기물 운반업체·처리장을 전국 어디서나 연결합니다. 올바로 전자인계서도 자동으로 처리합니다.</p>
  <a class="button" href="/">서비스 시작하기</a>
</div>

<section id="how">
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
  <h2>상품·요금</h2>
  <p class="lead">아래 상품은 가격이 정해진 상품으로, 대상 회원은 가입 후 앱·웹에서 결제할 수 있습니다.</p>
  <div class="products">${products.map((p) => renderProduct(p, isPurchasable(p, options))).join('')}
  </div>
</section>

<section id="refund">
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
</body>
</html>`;
}
