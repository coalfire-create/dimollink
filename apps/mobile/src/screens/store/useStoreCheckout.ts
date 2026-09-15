import React, { useCallback, useEffect, useState } from 'react';
import * as PortOne from '@portone/react-native-sdk';
import type { SalesProduct } from '@dimol/shared';
import {
  ApiError,
  cancelSubscription,
  listProducts,
  listSubscriptions,
  purchaseProduct,
  subscribeProduct,
  type SafeSubscription,
} from '../../api/client';
import { PORTONE } from '../../config';

/**
 * 스토어 결제 흐름 — 상품 조회, 일반결제, 정기결제(빌링키), 해지.
 *
 * **결제창이 갈린다.** PG 심사 요건이라 섞으면 반려된다:
 *  - 일반결제 → `PortOne.Payment` (일반결제창)
 *  - 월 정기결제 → `PortOne.IssueBillingKey` (정기결제창, 빌링키 발급)
 * 정기결제를 일반결제창으로 처리하면 매달 자동청구가 성립하지 않는다.
 *
 * 금액 검증은 서버가 상품가와 대조해서 한다 — 앱이 보낸 값을 믿지 않는다.
 */

export type PaymentRequest = React.ComponentProps<typeof PortOne.Payment>['request'];
type PaymentResponse = Parameters<
  NonNullable<React.ComponentProps<typeof PortOne.Payment>['onComplete']>
>[0];
export type BillingKeyRequest = React.ComponentProps<typeof PortOne.IssueBillingKey>['request'];
type BillingKeyResponse = Parameters<
  NonNullable<React.ComponentProps<typeof PortOne.IssueBillingKey>['onComplete']>
>[0];

/** 결제 건 식별자. 서버·PG 가 이 값으로 결제를 추적한다. */
function newPaymentId(): string {
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useStoreCheckout() {
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [subscriptions, setSubscriptions] = useState<SafeSubscription[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /** 결제창 요청. 둘 중 하나만 열린다 — 같은 화면에 두 창이 뜨면 안 된다. */
  const [payRequest, setPayRequest] = useState<PaymentRequest | null>(null);
  const [billingRequest, setBillingRequest] = useState<BillingKeyRequest | null>(null);
  /** 결제창을 연 상품. 콜백에서 어떤 상품인지 알아야 한다. */
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setProducts(await listProducts());
      setSubscriptions(await listSubscriptions().catch(() => []));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '상품을 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── 일반결제: 일반결제창 ──────────────────────────────────────────────
  function startOneTime(product: SalesProduct) {
    setError(null);
    setNotice(null);
    setPendingProductId(product.id);
    setPayRequest({
      storeId: PORTONE.storeId,
      channelKey: PORTONE.channelKey,
      paymentId: newPaymentId(),
      orderName: product.name,
      totalAmount: product.price,
      currency: 'CURRENCY_KRW',
      payMethod: 'CARD',
    });
  }

  async function onPaymentComplete(res: PaymentResponse) {
    setPayRequest(null);
    const productId = pendingProductId;
    setPendingProductId(null);
    if ('code' in res && res.code != null) {
      setError(res.message || '결제에 실패했어요.');
      return;
    }
    if (!res.paymentId || !productId) {
      setError('결제 정보를 확인하지 못했어요.');
      return;
    }
    setBusyId(productId);
    try {
      const result = await purchaseProduct(productId, res.paymentId);
      setNotice(`결제가 완료되었습니다. ${result.servicePeriod}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '결제 검증에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  // ── 정기결제: 정기결제창(빌링키 발급) ────────────────────────────────
  function startSubscription(product: SalesProduct) {
    setError(null);
    setNotice(null);
    setPendingProductId(product.id);
    setBillingRequest({
      storeId: PORTONE.storeId,
      channelKey: PORTONE.channelKey,
      billingKeyMethod: 'CARD',
      issueName: product.name,
    });
  }

  async function onBillingKeyComplete(res: BillingKeyResponse) {
    setBillingRequest(null);
    const productId = pendingProductId;
    setPendingProductId(null);
    if ('code' in res && res.code != null) {
      setError(res.message || '정기결제 등록에 실패했어요.');
      return;
    }
    if (!res.billingKey || !productId) {
      setError('결제수단 정보를 확인하지 못했어요.');
      return;
    }
    setBusyId(productId);
    try {
      await subscribeProduct(productId, res.billingKey);
      setNotice('정기결제가 등록되었습니다. 매월 같은 날 자동으로 결제됩니다.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '구독 등록에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(subscription: SafeSubscription) {
    setBusyId(subscription.id);
    setError(null);
    try {
      await cancelSubscription(subscription.id);
      setNotice('해지되었습니다. 이미 결제한 이용 기간은 끝까지 사용할 수 있어요.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '해지에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  /** 결제창이 실패로 닫혔을 때 — 열려 있던 요청과 대기 상품을 함께 정리한다. */
  function failCheckout(message: string) {
    setPayRequest(null);
    setBillingRequest(null);
    setPendingProductId(null);
    setError(message);
  }

  return {
    products,
    subscriptions,
    activeSubscriptionOf: (productId: string) =>
      subscriptions.find((s) => s.productId === productId && s.status !== 'CANCELLED'),
    cancelledSubscriptions: subscriptions.filter((s) => s.status === 'CANCELLED'),
    error,
    notice,
    busyId,
    payRequest,
    billingRequest,
    onPaymentComplete,
    onBillingKeyComplete,
    failCheckout,
    startOneTime,
    startSubscription,
    cancel,
  };
}

export type StoreCheckoutState = ReturnType<typeof useStoreCheckout>;
