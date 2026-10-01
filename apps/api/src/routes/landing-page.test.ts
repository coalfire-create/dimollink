import { COMPANY_INFO, SALES_PRODUCTS } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { escapeHtml, renderLandingPage } from './landing-page.js';

/**
 * 공개 소개 페이지 — 토스페이먼츠 가맹 심사가 홈페이지에서 확인하는 항목이 빠지지 않게 한다.
 * 상품: 이미지·금액·상세·제공기간·환불 정책 / 푸터: 사업자 정보·고객센터 전화번호.
 */

describe('renderLandingPage — 심사 항목', () => {
  const html = renderLandingPage(SALES_PRODUCTS, { billingEnabled: true });

  it('판매 상품마다 이미지·금액·혜택·제공기간·환불 정책이 보인다', () => {
    for (const p of SALES_PRODUCTS) {
      expect(html).toContain(`src="${p.imagePath}"`);
      expect(html).toContain(`${p.price.toLocaleString('ko-KR')}원`);
      expect(html).toContain(escapeHtml(p.servicePeriod.label));
      for (const benefit of p.benefits) expect(html).toContain(escapeHtml(benefit));
      for (const rule of p.refundPolicy) expect(html).toContain(escapeHtml(rule));
    }
  });

  it('푸터에 사업자 정보와 고객센터 전화번호가 있다', () => {
    const footer = html.slice(html.indexOf('<footer>'));
    expect(footer).toContain(COMPANY_INFO.businessNumber);
    expect(footer).toContain(COMPANY_INFO.representative);
    expect(footer).toContain(COMPANY_INFO.address);
    expect(footer).toContain(COMPANY_INFO.supportPhone);
    expect(footer).toContain('/terms');
    expect(footer).toContain('/privacy');
  });

  it('빌링 채널이 있으면 구독 버튼, 없으면 상품은 그대로 두고 "준비 중" 안내', () => {
    expect(html).toContain('앱에서 구독하기');
    const pending = renderLandingPage(SALES_PRODUCTS, { billingEnabled: false });
    for (const p of SALES_PRODUCTS) expect(pending).toContain(`id="product-${p.id}"`);
    expect(pending).not.toContain('앱에서 구독하기');
    expect(pending).toContain('정기결제 준비 중');
  });

  it('비어 있는 사업자 항목(통신판매업 신고번호 등)은 줄째 숨긴다', () => {
    if (!COMPANY_INFO.mailOrderNumber) expect(html).not.toContain('통신판매업신고');
  });
});

describe('escapeHtml', () => {
  it('태그·따옴표를 막는다', () => {
    expect(escapeHtml(`"><script>alert('x')</script>`)).not.toMatch(/[<>"']/);
  });
});
