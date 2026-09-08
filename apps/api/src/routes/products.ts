import { Router, type Response } from 'express';
import {
  SALES_PRODUCTS,
  findSalesProduct,
  toSafeSubscription,
} from '@dimol/shared';
import { authUserId } from '../middleware/auth.js';
import type { PortOneClient } from '../payment/portone-client.js';
import { PortOneError } from '../payment/portone-client.js';
import { SubscriptionError, type SubscriptionStore } from '../subscriptions/store.js';

/**
 * 실판매 상품 — 앱에서 실제로 결제 가능한 상품(PG 심사 대상).
 *
 * 매칭 선결제는 금액이 건마다 달라 심사자가 그대로 결제해 볼 수 없다. 그래서 가격이
 * 고정된 상품을 따로 두고, 결제 경로를 두 갈래로 나눈다:
 *  - 일반결제: 앱이 **일반결제창**으로 결제 → 여기서 금액을 검증한다.
 *  - 정기결제: 앱이 **정기결제창**으로 빌링키를 발급 → 여기서 구독을 만든다.
 * 두 창을 섞으면 심사에서 반려된다.
 */
export function createProductRouter(
  subscriptions: SubscriptionStore,
  portone: PortOneClient,
): Router {
  const router = Router();

  function fail(err: unknown, res: Response): void {
    if (err instanceof SubscriptionError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof PortOneError) {
      res.status(402).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: '상품 처리 오류' });
  }

  // GET /api/products — 판매 상품 목록(비로그인 조회 가능: 심사자가 먼저 본다)
  router.get('/products', (_req, res) => {
    res.json(SALES_PRODUCTS);
  });

  /**
   * POST /api/products/:id/purchase  { paymentId }
   * 일반결제 완료 검증. **금액 권위는 서버 상품가**다 — 앱이 보낸 금액은 믿지 않는다.
   */
  router.post('/products/:id/purchase', async (req, res) => {
    const product = findSalesProduct(req.params.id);
    if (!product || product.billingType !== 'ONE_TIME') {
      res.status(404).json({ error: '일반결제 상품을 찾을 수 없습니다.' });
      return;
    }
    const paymentId = (req.body ?? {}).paymentId;
    if (typeof paymentId !== 'string' || !paymentId.trim()) {
      res.status(400).json({ error: 'paymentId 가 필요합니다.' });
      return;
    }
    try {
      const verified = await portone.verifyPayment({
        paymentId: paymentId.trim(),
        expectedAmount: product.price,
      });
      res.json({
        productId: product.id,
        paid: verified.paid,
        amount: verified.amount,
        // 심사 요건: 결제 후 서비스 제공 완료까지의 기간을 응답·영수증에 남긴다.
        servicePeriod: product.servicePeriod.label,
      });
    } catch (err) {
      fail(err, res);
    }
  });

  /**
   * POST /api/products/:id/subscribe  { billingKey }
   * 정기결제창에서 발급받은 빌링키로 월 구독을 만든다.
   */
  router.post('/products/:id/subscribe', async (req, res) => {
    const product = findSalesProduct(req.params.id);
    if (!product || product.billingType !== 'MONTHLY_SUBSCRIPTION') {
      res.status(404).json({ error: '정기결제 상품을 찾을 수 없습니다.' });
      return;
    }
    const billingKey = (req.body ?? {}).billingKey;
    if (typeof billingKey !== 'string' || !billingKey.trim()) {
      res.status(400).json({ error: 'billingKey 가 필요합니다.' });
      return;
    }
    try {
      const sub = await subscriptions.create({
        userId: authUserId(req),
        productId: product.id,
        billingKey: billingKey.trim(),
      });
      // 빌링키는 결제를 일으킬 수 있는 값이라 응답에 넣지 않는다.
      res.status(201).json(toSafeSubscription(sub));
    } catch (err) {
      fail(err, res);
    }
  });

  // GET /api/subscriptions — 내 구독 목록
  router.get('/subscriptions', async (req, res) => {
    const rows = await subscriptions.listByUser(authUserId(req));
    res.json(rows.map(toSafeSubscription));
  });

  // POST /api/subscriptions/:id/cancel — 해지(다음 결제부터 미청구)
  router.post('/subscriptions/:id/cancel', async (req, res) => {
    try {
      res.json(toSafeSubscription(await subscriptions.cancel(req.params.id, authUserId(req))));
    } catch (err) {
      fail(err, res);
    }
  });

  return router;
}
