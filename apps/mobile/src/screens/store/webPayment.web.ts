import * as PortOne from '@portone/browser-sdk/v2';
import type {
  StorePaymentReturn,
  WebBillingInput,
  WebBillingResult,
  WebPaymentInput,
  WebPaymentResult,
} from './webPayment';

export type {
  StorePaymentReturn,
  WebBillingInput,
  WebBillingResult,
  WebPaymentInput,
  WebPaymentResult,
} from './webPayment';

/**
 * 웹 결제창 — 포트원 브라우저 SDK. PG 는 서버가 내려준 채널이 정한다(현재 KG이니시스).
 *
 * 웹에서는 React Native SDK 의 WebView 결제창이 동작하지 않는다. PG 심사자는 홈페이지
 * (= 웹앱)에서 결제창을 직접 열어 보므로 웹 전용 경로가 반드시 있어야 한다.
 *
 * PC 브라우저는 결제창이 iframe 으로 떠서 결과가 Promise 로 돌아오고, 모바일 브라우저는
 * 결제사 페이지로 **이동했다가 redirectUrl 로 돌아온다**. 돌아온 주소에는 결과가 쿼리로
 * 붙어 오므로([[takeStorePaymentReturn]]) 앱이 다시 스토어를 열어 마저 검증한다.
 */

const RETURN_FLAG = 'storeReturn';

function returnUrl(kind: 'payment' | 'billing', productId: string): string {
  const url = new URL(window.location.origin + '/');
  url.searchParams.set(RETURN_FLAG, kind);
  url.searchParams.set('productId', productId);
  return url.toString();
}

export function isStorePaymentReturn(): boolean {
  return new URLSearchParams(window.location.search).has(RETURN_FLAG);
}

/**
 * 리다이렉트로 돌아온 결제 결과를 꺼내고 주소창에서 지운다(한 번만 쓴다).
 * 새로고침할 때마다 같은 결제를 다시 검증하거나, 빌링키가 주소창에 남지 않게 한다.
 */
export function takeStorePaymentReturn(): StorePaymentReturn | null {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get(RETURN_FLAG);
  const productId = params.get('productId');
  if ((kind !== 'payment' && kind !== 'billing') || !productId) return null;
  window.history.replaceState(null, '', window.location.pathname);
  return {
    kind,
    productId,
    paymentId: params.get('paymentId') ?? undefined,
    billingKey: params.get('billingKey') ?? undefined,
    code: params.get('code') ?? undefined,
    message: params.get('message') ?? undefined,
  };
}

export async function requestWebPayment(input: WebPaymentInput): Promise<WebPaymentResult> {
  return PortOne.requestPayment({
    storeId: input.storeId,
    channelKey: input.channelKey,
    paymentId: input.paymentId,
    orderName: input.orderName,
    totalAmount: input.totalAmount,
    currency: 'CURRENCY_KRW',
    payMethod: 'CARD',
    customer: input.customer,
    redirectUrl: returnUrl('payment', input.productId),
  });
}

export async function requestWebBillingKey(input: WebBillingInput): Promise<WebBillingResult> {
  return PortOne.requestIssueBillingKey({
    storeId: input.storeId,
    channelKey: input.channelKey,
    billingKeyMethod: 'CARD',
    issueId: input.issueId,
    issueName: input.issueName,
    customer: input.customer,
    // 월 정기결제 상품만 판다([[sales-product]]). KG이니시스 모바일 발급은 제공 주기가 필수다.
    offerPeriod: { interval: '1m' },
    redirectUrl: returnUrl('billing', input.productId),
  });
}
