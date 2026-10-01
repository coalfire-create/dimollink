import React, { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as PortOne from '@portone/react-native-sdk';
import { addDays, type MembershipPass, type SalesProduct } from '@dimol/shared';
import {
  ApiError,
  cancelSubscription,
  listMembershipPasses,
  listProducts,
  listSubscriptions,
  purchaseProduct,
  subscribeProduct,
  type SafeSubscription,
} from '../../api/client';
import { usePaymentConfig } from '../../lib/payment-config';
import { useSession } from '../../navigation';
import { requestWebBillingKey, requestWebPayment, takeStorePaymentReturn } from './webPayment';

/**
 * 스토어 결제 흐름 — 상품 조회, 일반결제, 정기결제(빌링키), 해지.
 *
 * **결제창이 갈린다.** PG 심사 요건이라 섞으면 반려된다:
 *  - 일반결제 → `PortOne.Payment` (일반결제창)
 *  - 월 정기결제 → `PortOne.IssueBillingKey` (정기결제창, 빌링키 발급)
 * 정기결제를 일반결제창으로 처리하면 매달 자동청구가 성립하지 않는다.
 *
 * 금액 검증은 서버가 상품가와 대조해서 한다 — 앱이 보낸 값을 믿지 않는다.
 *
 * **웹은 결제창이 다르다.** React Native SDK 의 WebView 결제창은 웹에서 동작하지 않으므로
 * 웹은 포트원 브라우저 SDK([[webPayment.web]])로 같은 두 창을 연다. 모바일 브라우저는
 * 결제사 페이지로 갔다가 돌아오므로, 돌아온 결과를 화면이 열릴 때 마저 처리한다.
 *
 * 정기결제는 **빌링 채널**(PG 자동결제 계약)로만 연다. 일반결제 채널로는 빌링키가 발급되지 않는다.
 */

const isWeb = Platform.OS === 'web';

/** 종료일(미포함) → 사람이 읽는 마지막 이용일. */
const lastDay = (endDateExclusive: string) => addDays(endDateExclusive, -1);

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
  const portone = usePaymentConfig();
  const user = useSession();
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [subscriptions, setSubscriptions] = useState<SafeSubscription[]>([]);
  const [passes, setPasses] = useState<MembershipPass[]>([]);
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
      setPasses(await listMembershipPasses().catch(() => []));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '상품을 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 모바일 브라우저 결제는 결제사 페이지에 갔다가 돌아온다 — 돌아온 결과를 마저 처리한다.
  useEffect(() => {
    if (!isWeb) return;
    const back = takeStorePaymentReturn();
    if (!back) return;
    if (back.kind === 'payment') void finishPurchase(back.productId, back);
    else void finishSubscription(back.productId, back);
    // 화면이 처음 열릴 때 한 번만 본다(주소창에서 이미 지웠다).
  }, []);

  // ── 일반결제: 일반결제창 ──────────────────────────────────────────────
  function startOneTime(product: SalesProduct) {
    setError(null);
    setNotice(null);
    const paymentId = newPaymentId();
    if (isWeb) {
      setBusyId(product.id);
      requestWebPayment({
        storeId: portone.storeId,
        channelKey: portone.channelKey,
        paymentId,
        orderName: product.name,
        totalAmount: product.price,
        productId: product.id,
      })
        .then((res) => {
          setBusyId(null);
          // undefined = 결제사 페이지로 이동했다(돌아오면 [[takeStorePaymentReturn]] 이 받는다).
          if (res) void finishPurchase(product.id, res);
        })
        .catch((err: unknown) => {
          setBusyId(null);
          setError(err instanceof Error ? err.message : '결제창을 열지 못했어요.');
        });
      return;
    }
    setPendingProductId(product.id);
    setPayRequest({
      storeId: portone.storeId,
      channelKey: portone.channelKey,
      paymentId,
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
    if (!productId) {
      setError('결제 정보를 확인하지 못했어요.');
      return;
    }
    await finishPurchase(productId, {
      paymentId: res.paymentId,
      code: 'code' in res && res.code != null ? String(res.code) : undefined,
      message: 'message' in res ? res.message : undefined,
    });
  }

  /** 결제창 결과(앱·웹·리다이렉트 공통) → 서버 검증. */
  async function finishPurchase(
    productId: string,
    res: { paymentId?: string; code?: string; message?: string },
  ) {
    if (res.code) {
      setError(res.message || '결제에 실패했어요.');
      return;
    }
    if (!res.paymentId) {
      setError('결제 정보를 확인하지 못했어요.');
      return;
    }
    setBusyId(productId);
    try {
      const result = await purchaseProduct(productId, res.paymentId);
      setNotice(
        result.pass
          ? `결제가 완료되었습니다. ${result.pass.startDate}부터 ${lastDay(result.pass.endDate)}까지 이용할 수 있어요.`
          : `결제가 완료되었습니다. ${result.servicePeriod}`,
      );
      await load();
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
    const channelKey = portone.billingChannelKey;
    if (!channelKey) {
      // 서버가 빌링 채널 없이 정기결제 상품을 내려주지 않으므로 보통은 여기 오지 않는다.
      setError('지금은 정기결제를 이용할 수 없어요.');
      return;
    }
    if (isWeb) {
      setBusyId(product.id);
      requestWebBillingKey({
        storeId: portone.storeId,
        channelKey,
        issueName: product.name,
        customerId: user.id,
        productId: product.id,
      })
        .then((res) => {
          setBusyId(null);
          if (res) void finishSubscription(product.id, res);
        })
        .catch((err: unknown) => {
          setBusyId(null);
          setError(err instanceof Error ? err.message : '정기결제창을 열지 못했어요.');
        });
      return;
    }
    setPendingProductId(product.id);
    setBillingRequest({
      storeId: portone.storeId,
      channelKey,
      billingKeyMethod: 'CARD',
      issueName: product.name,
      customer: { customerId: user.id },
    });
  }

  async function onBillingKeyComplete(res: BillingKeyResponse) {
    setBillingRequest(null);
    const productId = pendingProductId;
    setPendingProductId(null);
    if (!productId) {
      setError('결제수단 정보를 확인하지 못했어요.');
      return;
    }
    await finishSubscription(productId, {
      billingKey: res.billingKey,
      code: 'code' in res && res.code != null ? String(res.code) : undefined,
      message: 'message' in res ? res.message : undefined,
    });
  }

  /** 빌링키 발급 결과 → 서버가 첫 달을 청구하고 구독을 만든다. */
  async function finishSubscription(
    productId: string,
    res: { billingKey?: string; code?: string; message?: string },
  ) {
    if (res.code) {
      setError(res.message || '정기결제 등록에 실패했어요.');
      return;
    }
    if (!res.billingKey) {
      setError('결제수단 정보를 확인하지 못했어요.');
      return;
    }
    setBusyId(productId);
    try {
      await subscribeProduct(productId, res.billingKey);
      setNotice(
        '정기결제가 등록되고 첫 달이 결제되었습니다. 다음 달부터 같은 날 자동으로 결제됩니다.',
      );
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

  /** 이 상품의 이용권 중 아직 끝나지 않은 것의 마지막 이용일(없으면 null). */
  function passUntil(productId: string): string | null {
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const end = passes
      .filter((p) => p.productId === productId && p.endDate > today)
      .map((p) => p.endDate)
      .sort()
      .pop();
    return end ? lastDay(end) : null;
  }

  return {
    products,
    passUntil,
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
