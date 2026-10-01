/**
 * 웹 결제창(포트원 브라우저 SDK) — 네이티브 빌드용 자리.
 *
 * 네이티브 앱은 `@portone/react-native-sdk` 의 WebView 결제창을 쓰므로 이 함수들을
 * 부르지 않는다. 실제 구현은 `webPayment.web.ts`(Metro 가 웹 번들에서만 고른다)에 있고,
 * 이 파일은 같은 시그니처로 타입과 네이티브 번들을 맞춘다.
 */

export interface StorePaymentReturn {
  productId: string;
  kind: 'payment' | 'billing';
  paymentId?: string;
  billingKey?: string;
  /** 실패/취소면 채워진다. */
  code?: string;
  message?: string;
}

export interface WebPaymentInput {
  storeId: string;
  channelKey: string;
  paymentId: string;
  orderName: string;
  totalAmount: number;
  productId: string;
}

export interface WebBillingInput {
  storeId: string;
  channelKey: string;
  issueName: string;
  customerId: string;
  productId: string;
}

/** 결제창 결과. `undefined` 는 페이지가 리다이렉트로 넘어갔다는 뜻이다(모바일 브라우저). */
export type WebPaymentResult = { paymentId?: string; code?: string; message?: string } | undefined;
export type WebBillingResult = { billingKey?: string; code?: string; message?: string } | undefined;

export function isStorePaymentReturn(): boolean {
  return false;
}

export function takeStorePaymentReturn(): StorePaymentReturn | null {
  return null;
}

export async function requestWebPayment(_input: WebPaymentInput): Promise<WebPaymentResult> {
  throw new Error('웹 결제창은 웹 브라우저에서만 쓸 수 있습니다.');
}

export async function requestWebBillingKey(_input: WebBillingInput): Promise<WebBillingResult> {
  throw new Error('웹 결제창은 웹 브라우저에서만 쓸 수 있습니다.');
}
