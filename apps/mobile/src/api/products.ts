import type { SalesProduct, Subscription } from '@dimol/shared';
import { api } from './http';

/**
 * 실판매 상품 API — 일반결제 / 월 정기결제.
 *
 * 공통 인프라(베이스 URL·인증 헤더·오류 처리)는 [[http]] 에 있다.
 * 구독 응답에는 빌링키가 없다(서버가 뺀다) — 결제를 일으킬 수 있는 값이라 앱에 두지 않는다.
 */

export type SafeSubscription = Omit<Subscription, 'billingKey'>;

/** 판매 상품 목록. 로그인 없이도 볼 수 있다. */
export const listProducts = () => api<SalesProduct[]>('/products');

/**
 * 일반결제 완료 검증. 금액은 서버가 상품가와 대조하므로 앱이 금액을 보내지 않는다.
 * 응답의 servicePeriod 는 "결제 후 서비스 제공 완료까지"의 기간이다(심사 필수 항목).
 */
export const purchaseProduct = (productId: string, paymentId: string) =>
  api<{ productId: string; paid: boolean; amount: number; servicePeriod: string }>(
    `/products/${productId}/purchase`,
    { method: 'POST', body: JSON.stringify({ paymentId }) },
  );

/** 정기결제창에서 발급받은 빌링키로 월 구독을 만든다. */
export const subscribeProduct = (productId: string, billingKey: string) =>
  api<SafeSubscription>(`/products/${productId}/subscribe`, {
    method: 'POST',
    body: JSON.stringify({ billingKey }),
  });

/** 협력 업체 목록 상단에 노출할 업체(멤버십 회원) id. 로그인 없이도 볼 수 있다. */
export const listFeaturedProviders = () =>
  api<{ providerIds: string[] }>('/products/featured-providers');

export const listSubscriptions = () => api<SafeSubscription[]>('/subscriptions');

/** 해지 — 다음 결제부터 청구되지 않고, 이미 결제한 기간은 끝까지 쓴다. */
export const cancelSubscription = (subscriptionId: string) =>
  api<SafeSubscription>(`/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    body: '{}',
  });
