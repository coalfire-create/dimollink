/**
 * 요청 선결제의 웹 결제창(포트원 브라우저 SDK) — 네이티브 빌드용 자리.
 *
 * 네이티브 앱은 `@portone/react-native-sdk` 의 WebView 결제창을 쓰므로 이 함수들을
 * 부르지 않는다. 실제 구현은 `request-web-payment.web.ts`(Metro 가 웹 번들에서만 고른다)에
 * 있고, 이 파일은 같은 시그니처로 타입과 네이티브 번들을 맞춘다([[webPayment]] 와 같은 구조).
 */

import type { PortOneCustomer } from './portone-customer';

export type RequestPayMethod = 'VBANK' | 'CARD';
export type RequestPaymentSource = 'waste' | 'interior';

export interface RequestWebPaymentInput {
  storeId: string;
  channelKey: string;
  paymentId: string;
  orderName: string;
  totalAmount: number;
  payMethod: RequestPayMethod;
  customer: PortOneCustomer;
  /** 돌아올 화면을 찾는 값 — 모바일 브라우저는 결제사 페이지에 갔다가 돌아온다. */
  requestId: string;
  source: RequestPaymentSource;
}

/** 결제창 결과. `undefined` 는 페이지가 리다이렉트로 넘어갔다는 뜻이다(모바일 브라우저). */
export type RequestWebPaymentResult =
  { paymentId?: string; code?: string; message?: string } | undefined;

/** 리다이렉트로 돌아온 결제 결과. */
export interface RequestPaymentReturn {
  requestId: string;
  source: RequestPaymentSource;
  payMethod: RequestPayMethod;
  paymentId?: string;
  /** 실패/취소면 채워진다. */
  code?: string;
  message?: string;
}

export function peekRequestPaymentReturn(): Pick<
  RequestPaymentReturn,
  'requestId' | 'source'
> | null {
  return null;
}

export function takeRequestPaymentReturn(_requestId: string): RequestPaymentReturn | null {
  return null;
}

export async function requestWebRequestPayment(
  _input: RequestWebPaymentInput,
): Promise<RequestWebPaymentResult> {
  throw new Error('웹 결제창은 웹 브라우저에서만 쓸 수 있습니다.');
}
