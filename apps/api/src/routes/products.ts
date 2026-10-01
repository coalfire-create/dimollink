import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import {
  SALES_PRODUCTS,
  isAvailableTo,
  isPurchasable,
  toSafeSubscription,
  type SalesProduct,
} from '@dimol/shared';
import { authUser, authUserId } from '../middleware/auth.js';
import type { PortOneClient } from '../payment/portone-client.js';
import { PortOneError } from '../payment/portone-client.js';
import type { MembershipService } from '../subscriptions/membership.js';
import type { PassStore } from '../subscriptions/pass-store.js';
import { SubscriptionError, type SubscriptionStore } from '../subscriptions/store.js';

/**
 * 실판매 상품 — 앱에서 실제로 결제 가능한 상품(PG 심사 대상).
 *
 * 매칭 선결제는 금액이 건마다 달라 심사자가 그대로 결제해 볼 수 없다. 그래서 가격이
 * 고정된 상품을 따로 두고, 결제 경로를 두 갈래로 나눈다:
 *  - 일반결제: 앱이 **일반결제창**으로 결제 → 여기서 금액을 검증한다.
 *  - 정기결제: 앱이 **정기결제창**으로 빌링키를 발급 → 여기서 구독을 만든다.
 * 두 창을 섞으면 심사에서 반려된다.
 *
 * 상품은 항상 목록에 나온다(심사·고객 안내). 정기결제는 PG 의 자동결제(빌링) 채널이
 * 있을 때만 결제를 받는다(`billingEnabled`) — 채널 없이 빌링키 발급을 시도하면 결제창이
 * 실패하므로 구독 경로에서 먼저 막는다.
 */
export function createProductRouter(
  subscriptions: SubscriptionStore,
  portone: PortOneClient,
  options: {
    billingEnabled: boolean;
    /** 상단 노출 대상(멤버십 회원) 조회. 없으면 빈 목록. */
    membership?: Pick<MembershipService, 'memberIdsOn'>;
    /** 기간제 이용권 저장소. 이용권 상품(grantsDays)을 결제하면 여기에 기간이 생긴다. */
    passes?: PassStore;
    /** 판매 상품 목록. 테스트에서 고정 상품을 넣을 때만 바꾼다. */
    catalog?: readonly SalesProduct[];
  },
): Router {
  const router = Router();
  const catalog = options.catalog ?? SALES_PRODUCTS;
  const findProduct = (id: string) => catalog.find((p) => p.id === id);

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
    res.json(catalog);
  });

  /**
   * GET /api/products/featured-providers — 협력 업체 목록 상단에 노출할 업체(멤버십 회원).
   * 상단 노출은 유료 광고라 누가 받는지가 공개돼도 된다. id 만 내려준다.
   */
  router.get('/products/featured-providers', async (_req, res) => {
    res.json({ providerIds: (await options.membership?.memberIdsOn()) ?? [] });
  });

  /**
   * POST /api/products/:id/purchase  { paymentId }
   * 일반결제 완료 검증. **금액 권위는 서버 상품가**다 — 앱이 보낸 금액은 믿지 않는다.
   * 이용권 상품(grantsDays)이면 결제가 확인된 뒤 이용 기간을 만든다.
   */
  router.post('/products/:id/purchase', async (req, res) => {
    const product = findProduct(req.params.id);
    if (!product || product.billingType !== 'ONE_TIME') {
      res.status(404).json({ error: '일반결제 상품을 찾을 수 없습니다.' });
      return;
    }
    const paymentId = (req.body ?? {}).paymentId;
    if (typeof paymentId !== 'string' || !paymentId.trim()) {
      res.status(400).json({ error: 'paymentId 가 필요합니다.' });
      return;
    }
    if (!isAvailableTo(product, authUser(req).userType)) {
      res
        .status(403)
        .json({ error: '이 회원 유형은 살 수 없는 상품입니다.', code: 'NOT_ELIGIBLE' });
      return;
    }
    const userId = authUserId(req);
    try {
      // 같은 결제를 다른 사람이 들고 와서 이용권을 받아 가지 못하게 한다.
      const used = await options.passes?.findByPaymentId(paymentId.trim());
      if (used && used.userId !== userId) {
        res.status(409).json({ error: '이미 사용된 결제입니다.', code: 'PAYMENT_ALREADY_USED' });
        return;
      }
      const verified = await portone.verifyPayment({
        paymentId: paymentId.trim(),
        expectedAmount: product.price,
      });
      const pass =
        verified.paid && product.grantsDays && options.passes
          ? await options.passes.grant({
              userId,
              productId: product.id,
              paymentId: paymentId.trim(),
              amount: verified.amount,
              days: product.grantsDays,
            })
          : undefined;
      res.json({
        productId: product.id,
        paid: verified.paid,
        amount: verified.amount,
        // 심사 요건: 결제 후 서비스 제공 완료까지의 기간을 응답·영수증에 남긴다.
        servicePeriod: product.servicePeriod.label,
        ...(pass ? { pass: { startDate: pass.startDate, endDate: pass.endDate } } : {}),
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
    const product = findProduct(req.params.id);
    if (!product || product.billingType !== 'MONTHLY_SUBSCRIPTION') {
      res.status(404).json({ error: '정기결제 상품을 찾을 수 없습니다.' });
      return;
    }
    if (!isPurchasable(product, options)) {
      res.status(409).json({
        error: '지금은 정기결제를 이용할 수 없습니다. 준비되면 안내해 드릴게요.',
        code: 'BILLING_UNAVAILABLE',
      });
      return;
    }
    if (!isAvailableTo(product, authUser(req).userType)) {
      res
        .status(403)
        .json({ error: '이 회원 유형은 구독할 수 없는 상품입니다.', code: 'NOT_ELIGIBLE' });
      return;
    }
    const billingKey = (req.body ?? {}).billingKey;
    if (typeof billingKey !== 'string' || !billingKey.trim()) {
      res.status(400).json({ error: 'billingKey 가 필요합니다.' });
      return;
    }
    const userId = authUserId(req);
    try {
      // 이중 구독은 결제 **전에** 막는다. 첫 달을 청구한 뒤에 거절하면 돈만 빠져나간다.
      const existing = await subscriptions.listByUser(userId);
      if (existing.some((s) => s.productId === product.id && s.status === 'ACTIVE')) {
        throw new SubscriptionError('이미 구독 중인 상품입니다.');
      }
      // 첫 달은 지금 청구한다. 빌링키 발급창(IssueBillingKey)은 결제를 하지 않고,
      // 스케줄러는 다음 결제일(한 달 뒤)부터 청구하므로 여기서 안 하면 첫 달이 무료가 된다.
      // 승인이 안 나면 구독을 만들지 않는다.
      const charged = await portone.payWithBillingKey({
        paymentId: `sub_first_${randomUUID()}`,
        billingKey: billingKey.trim(),
        orderName: product.name,
        amount: product.price,
        customerId: userId,
      });
      if (!charged.paid) {
        res.status(402).json({ error: '첫 달 결제가 승인되지 않았습니다.', code: 'NOT_PAID' });
        return;
      }
      const sub = await subscriptions.create({
        userId,
        productId: product.id,
        billingKey: billingKey.trim(),
      });
      // 빌링키는 결제를 일으킬 수 있는 값이라 응답에 넣지 않는다.
      res.status(201).json(toSafeSubscription(sub));
    } catch (err) {
      fail(err, res);
    }
  });

  // GET /api/membership-passes — 내 이용권(최근 종료일 순)
  router.get('/membership-passes', async (req, res) => {
    const mine = (await options.passes?.listByUser(authUserId(req))) ?? [];
    res.json([...mine].sort((a, b) => b.endDate.localeCompare(a.endDate)));
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
