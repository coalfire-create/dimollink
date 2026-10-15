import * as PortOne from '@portone/browser-sdk/v2';
import { VIRTUAL_ACCOUNT_VALID_HOURS } from '@dimol/shared';
import type {
  RequestPaymentReturn,
  RequestPaymentSource,
  RequestPayMethod,
  RequestWebPaymentInput,
  RequestWebPaymentResult,
} from './request-web-payment';

export type {
  RequestPaymentReturn,
  RequestPaymentSource,
  RequestPayMethod,
  RequestWebPaymentInput,
  RequestWebPaymentResult,
} from './request-web-payment';

/**
 * 요청 선결제의 웹 결제창 — 포트원 브라우저 SDK. PG 는 서버가 내려준 채널이 정한다.
 *
 * 웹에서는 React Native SDK 의 WebView 결제창이 동작하지 않는다. 웹으로 들어온 배출자도
 * 매칭이 끝나면 바로 결제할 수 있어야 해서 스토어([[webPayment.web]])와 같은 방식으로 연다.
 *
 * PC 브라우저는 결제창이 iframe 으로 떠서 결과가 Promise 로 돌아오고, 모바일 브라우저는
 * 결제사 페이지로 **이동했다가 redirectUrl 로 돌아온다**. 돌아온 주소에 결과가 쿼리로 붙어
 * 오므로 앱이 결제 화면을 다시 열고([[peekRequestPaymentReturn]]) 화면이 마저 검증한다
 * ([[takeRequestPaymentReturn]]).
 */

const RETURN_FLAG = 'payReturn';

function returnUrl(input: RequestWebPaymentInput): string {
  const url = new URL(window.location.origin + '/');
  url.searchParams.set(RETURN_FLAG, 'request');
  url.searchParams.set('requestId', input.requestId);
  url.searchParams.set('source', input.source);
  url.searchParams.set('payMethod', input.payMethod);
  return url.toString();
}

function parseSource(value: string | null): RequestPaymentSource {
  return value === 'interior' ? 'interior' : 'waste';
}

function parsePayMethod(value: string | null): RequestPayMethod {
  return value === 'CARD' ? 'CARD' : 'VBANK';
}

/** 앱 시작 시 — 결제사에서 돌아온 건지, 돌아왔다면 어느 요청의 결제 화면을 열지. 주소는 그대로 둔다. */
export function peekRequestPaymentReturn(): Pick<
  RequestPaymentReturn,
  'requestId' | 'source'
> | null {
  const params = new URLSearchParams(window.location.search);
  const requestId = params.get('requestId');
  if (params.get(RETURN_FLAG) !== 'request' || !requestId) return null;
  return { requestId, source: parseSource(params.get('source')) };
}

/**
 * 결제 화면이 열릴 때 — 이 요청의 결제 결과를 꺼내고 주소창에서 지운다(한 번만 쓴다).
 * 새로고침할 때마다 같은 결제를 다시 검증하지 않게 한다.
 */
export function takeRequestPaymentReturn(requestId: string): RequestPaymentReturn | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get(RETURN_FLAG) !== 'request' || params.get('requestId') !== requestId) return null;
  window.history.replaceState(null, '', window.location.pathname);
  return {
    requestId,
    source: parseSource(params.get('source')),
    payMethod: parsePayMethod(params.get('payMethod')),
    paymentId: params.get('paymentId') ?? undefined,
    code: params.get('code') ?? undefined,
    message: params.get('message') ?? undefined,
  };
}

export async function requestWebRequestPayment(
  input: RequestWebPaymentInput,
): Promise<RequestWebPaymentResult> {
  const common = {
    storeId: input.storeId,
    channelKey: input.channelKey,
    paymentId: input.paymentId,
    orderName: input.orderName,
    totalAmount: input.totalAmount,
    currency: 'CURRENCY_KRW' as const,
    customer: input.customer,
    redirectUrl: returnUrl(input),
  };
  // KG이니시스는 가상계좌 입금기한이 필수다(앱 결제창과 같은 값).
  return input.payMethod === 'VBANK'
    ? PortOne.requestPayment({
        ...common,
        payMethod: 'VIRTUAL_ACCOUNT',
        virtualAccount: { accountExpiry: { validHours: VIRTUAL_ACCOUNT_VALID_HOURS } },
      })
    : PortOne.requestPayment({ ...common, payMethod: 'CARD' });
}
