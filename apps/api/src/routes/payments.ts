import {
  buildKoreanHolidaySet,
  canReceivePayout,
  type CancellationStage,
} from '@dimol/shared';
import { Router } from 'express';
import { env } from '../config/env.js';
import { authUserId } from '../middleware/auth.js';
import { PaymentService } from '../payment/payment-service.js';
import type { PaymentStore } from '../payment/payment-store.js';
import { PortOneError } from '../payment/portone-client.js';
import type { QuoteStore } from '../quotes/store.js';
import type { PayableRequestStore } from '../payment/payable-request.js';
import type { UserStore } from '../users/store.js';
import type { PayoutAccountStore } from '../payout/store.js';
import {
  buildDealSettlementPlan,
  buildSettlementPlan,
  type BuildSettlementPlanInput,
} from '../settlement/plan.js';
import { CancellationNotAllowedError, calculateRefund } from '../settlement/refund.js';

/** PortOneError 코드 → HTTP 상태 매핑. */
const STATUS_BY_CODE: Record<string, number> = {
  CONFIG_MISSING: 503,
  LIVE_BLOCKED: 409,
  INVALID_AMOUNT: 400,
  AMOUNT_MISMATCH: 409,
  PAYMENT_NOT_FOUND: 404,
  PAYMENT_NOT_PAID: 409,
  WEBHOOK_INVALID: 400,
  NOT_CONFIGURED: 501,
  TIMEOUT: 504,
  UPSTREAM_ERROR: 502,
};

function sendPortOneError(
  res: import('express').Response,
  err: unknown,
  fallbackMsg: string,
): void {
  if (err instanceof PortOneError) {
    res.status(STATUS_BY_CODE[err.code] ?? 500).json({ error: err.message, code: err.code });
    return;
  }
  console.error(`[portone] ${fallbackMsg}`, err);
  res.status(500).json({ error: fallbackMsg });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 정산 플랜 입력 파싱. 공휴일은 요청에서 받은 음력·대체공휴일(extraHolidays)을 더해
 * 고정 공휴일 셋과 병합한다(미지정 시 고정 공휴일 + 주말만 순연).
 */
function parsePlanInput(body: unknown): BuildSettlementPlanInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.transportFee !== 'number' || b.transportFee < 0) {
    return 'transportFee(0 이상 숫자)가 필요합니다.';
  }
  if (typeof b.disposalFee !== 'number' || b.disposalFee < 0) {
    return 'disposalFee(0 이상 숫자)가 필요합니다.';
  }
  if (typeof b.completedDate !== 'string' || !DATE_RE.test(b.completedDate)) {
    return 'completedDate(YYYY-MM-DD)가 필요합니다.';
  }
  const year = Number(b.completedDate.slice(0, 4));
  const extra = Array.isArray(b.extraHolidays)
    ? b.extraHolidays.filter((d): d is string => typeof d === 'string')
    : [];
  return {
    transportFee: b.transportFee,
    disposalFee: b.disposalFee,
    completedDate: b.completedDate,
    holidays: buildKoreanHolidaySet([year, year + 1], extra),
    transportBusinessNumber:
      typeof b.transportBusinessNumber === 'string' ? b.transportBusinessNumber : undefined,
    disposalBusinessNumber:
      typeof b.disposalBusinessNumber === 'string' ? b.disposalBusinessNumber : undefined,
  };
}

/**
 * 결제/정산 라우트 — 정산 플랜 미리보기 + 선결제 + 정산일 지급대행.
 * DI를 위해 service를 주입받을 수 있게 한다.
 */
/**
 * @param requestStore 선결제 요청자 본인 검증·금액 권위·상태 전이용(선택). 폐기물/인테리어
 *                     요청을 합친 창구(PayableRequestStore)를 주입해 두 흐름을 모두 처리한다.
 * @param quoteStore   선결제 금액을 수락된 견적에서 산출(금액 권위, 선택). 주입 시 클라이언트 금액 무시.
 * @param paymentStore 결제 기록(취소 시 결제자 검증·환불 기준금액, 선택).
 */
export function createPaymentsRouter(
  service: PaymentService = new PaymentService(),
  requestStore?: PayableRequestStore,
  quoteStore?: QuoteStore,
  paymentStore?: PaymentStore,
  userStore?: UserStore,
  payoutAccountStore?: PayoutAccountStore,
): Router {
  const router = Router();

  /** completedDate + 공휴일(음력·대체공휴일)을 파싱해 공휴일 셋을 만든다. */
  function parseSettlementDate(body: Record<string, unknown>): { completedDate: string; holidays: ReturnType<typeof buildKoreanHolidaySet> } | string {
    if (typeof body.completedDate !== 'string' || !DATE_RE.test(body.completedDate)) {
      return 'completedDate(YYYY-MM-DD)가 필요합니다.';
    }
    const year = Number(body.completedDate.slice(0, 4));
    const extra = Array.isArray(body.extraHolidays)
      ? body.extraHolidays.filter((d): d is string => typeof d === 'string')
      : [];
    return { completedDate: body.completedDate, holidays: buildKoreanHolidaySet([year, year + 1], extra) };
  }

  /**
   * GET /api/payments/config — 앱이 결제창을 띄울 때 쓰는 공개 설정(상점·채널).
   *
   * 앱에 박아두지 않는 이유: PG(토스페이먼츠)나 채널을 바꿀 때마다 웹 번들을 다시
   * 빌드해야 하고, 서버가 결제 검증에 쓰는 storeId 와 앱이 결제창에 넘긴 storeId 가
   * 어긋나도 실제 결제가 실패할 때까지 모른다. 한 곳(서버 env)에서 내려준다.
   *
   * 시크릿이 아니다 — 결제창을 여는 데 필요한 공개 식별자이고, 실제 승인·조회는
   * 서버가 PORTONE_API_SECRET 으로 다시 검증한다.
   */
  router.get('/payments/config', (_req, res) => {
    if (!env.portone.storeId || !env.portone.channelKey) {
      res.status(503).json({
        error: '결제 설정이 아직 없습니다. 잠시 후 다시 시도해 주세요.',
        code: 'CONFIG_MISSING',
      });
      return;
    }
    res.json({
      storeId: env.portone.storeId,
      channelKey: env.portone.channelKey,
      /** test 면 실제 청구가 일어나지 않는다 — 앱이 안내 문구를 띄우는 데 쓴다. */
      mode: env.portone.mode,
    });
  });

  // POST /api/settlements/preview  정산 플랜 계산(포트원 호출 없음)
  router.post('/settlements/preview', (req, res) => {
    const parsed = parsePlanInput(req.body);
    if (typeof parsed === 'string') {
      res.status(400).json({ error: parsed });
      return;
    }
    res.json(buildSettlementPlan(parsed));
  });

  // POST /api/payments/prepay  선결제 확정 — 앱 포트원 SDK 체크아웃으로 만든 결제(paymentId)를
  // 서버가 검증(금액·상태)하고 결제완료(PAID)로 반영한다. (V2는 서버가 결제를 생성하지 않는다.)
  router.post('/payments/prepay', async (req, res) => {
    const body0 = (req.body ?? {}) as Record<string, unknown>;
    const matchRequestId = body0.matchRequestId;
    if (typeof matchRequestId !== 'string' || matchRequestId.trim() === '') {
      res.status(400).json({ error: 'matchRequestId(문자열)가 필요합니다.' });
      return;
    }
    const paymentId = body0.paymentId;
    if (typeof paymentId !== 'string' || paymentId.trim() === '') {
      res.status(400).json({
        error: 'paymentId(문자열)가 필요합니다. 앱에서 포트원 결제를 먼저 완료하세요.',
      });
      return;
    }
    const payerId = authUserId(req);
    // 선결제는 해당 요청의 요청자(배출자) 본인만.
    if (requestStore) {
      const request = await requestStore.get(matchRequestId);
      if (!request) {
        res.status(404).json({ error: '결제 대상 요청을 찾을 수 없습니다.' });
        return;
      }
      if (request.requesterId !== payerId) {
        res.status(403).json({ error: '본인 요청만 결제할 수 있어요.' });
        return;
      }
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const dateParsed = parseSettlementDate(body);
    if (typeof dateParsed === 'string') {
      res.status(400).json({ error: dateParsed });
      return;
    }

    // 금액 권위: 정산 금액은 클라이언트 입력이 아닌 서버 확정 금액에서 산출한다.
    // 확정 금액 = 요청의 합의 금액(선착순 수락 또는 수락된 견적 금액). 단일 party 로 청구.
    let fees: { transportFee: number; disposalFee: number };
    if (quoteStore || requestStore) {
      const agreedFee = (await requestStore?.get(matchRequestId))?.agreedFee;
      const accepted = await quoteStore?.acceptedFees(matchRequestId);
      const amount = agreedFee ?? (accepted ? accepted.transportFee + accepted.disposalFee : 0);
      if (amount <= 0) {
        res.status(409).json({
          error: '확정된 금액이 없어 결제할 수 없습니다. 견적 수락 또는 업체 수락(금액)을 먼저 진행해 주세요.',
          code: 'NO_AGREED_AMOUNT',
        });
        return;
      }
      fees = { transportFee: amount, disposalFee: 0 };
    } else {
      // 스토어 미주입(테스트) 시에만 클라이언트 금액 사용.
      fees = { transportFee: Number(body.transportFee), disposalFee: Number(body.disposalFee) };
    }

    const plan = buildSettlementPlan({
      transportFee: fees.transportFee,
      disposalFee: fees.disposalFee,
      completedDate: dateParsed.completedDate,
      holidays: dateParsed.holidays,
    });
    try {
      // 포트원에서 결제 상태·금액(=합의 금액)을 검증한다. 금액 불일치/미결제면 예외.
      const payment = await service.confirmPrepayment(paymentId, plan);
      await paymentStore?.record({
        paymentId: payment.paymentId,
        matchRequestId,
        payerId,
        amount: plan.prepaymentAmount,
      });
      // 결제 완료(PAID)면 매칭→결제완료로 전이. 가상계좌 발급만 된 상태(paid=false)면
      // 입금 완료 웹훅(Transaction.Paid)이 올 때까지 매칭 상태를 유지한다.
      if (payment.paid && (await requestStore?.get(matchRequestId))?.status === 'MATCHED') {
        try {
          await requestStore?.changeStatus(matchRequestId, 'PAID', { paymentId: payment.paymentId });
        } catch {
          // 상태 전이 실패가 결제 응답을 막지 않게 한다(결제는 이미 성립).
        }
      }
      res.json({ plan, payment });
    } catch (err) {
      sendPortOneError(res, err, '선결제 확정 처리 중 오류가 발생했습니다.');
    }
  });

  // POST /api/payments/webhook  포트원 웹훅 — 가상계좌 입금 완료(Transaction.Paid) 등 수신.
  // 서명 검증에 원본 바디가 필요하므로 app.ts에서 이 경로만 express.raw 로 파싱한다(req.body=Buffer).
  router.post('/payments/webhook', async (req, res) => {
    const raw = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body ?? {});
    try {
      const event = await service.verifyWebhook(raw, req.headers);
      // 결제 승인 이벤트면 결제 건을 재검증하고 해당 요청을 PAID 로 확정한다.
      if (
        (event.type === 'Transaction.Paid' || event.type === 'Transaction.VirtualAccountIssued') &&
        'data' in event &&
        event.data &&
        typeof (event.data as { paymentId?: unknown }).paymentId === 'string'
      ) {
        const evPaymentId = (event.data as { paymentId: string }).paymentId;
        if (event.type === 'Transaction.Paid') {
          const record = await paymentStore?.get(evPaymentId);
          if (record && (await requestStore?.get(record.matchRequestId))?.status === 'MATCHED') {
            try {
              await requestStore?.changeStatus(record.matchRequestId, 'PAID', { paymentId: evPaymentId });
            } catch {
              // 이미 전이됨 등 — 웹훅 응답을 막지 않는다.
            }
          }
        }
      }
      res.json({ received: true });
    } catch (err) {
      sendPortOneError(res, err, '웹훅 처리 중 오류가 발생했습니다.');
    }
  });

  // POST /api/payments/payouts  정산일 지급대행 실행(관리자/스케줄러). 금액·사업자번호는 서버 확정값.
  router.post('/payments/payouts', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const matchRequestId = body.matchRequestId;
    if (typeof matchRequestId !== 'string' || matchRequestId.trim() === '') {
      res.status(400).json({ error: 'matchRequestId(문자열)가 필요합니다.' });
      return;
    }
    const dateParsed = parseSettlementDate(body);
    if (typeof dateParsed === 'string') {
      res.status(400).json({ error: dateParsed });
      return;
    }

    // 지급 금액 = 요청 합의 금액(권위). 사업자번호 = 매칭된 셀러의 등록번호.
    let plan;
    /** 정산 계좌 확인에 쓴다(아래 블록 밖에서 필요해 여기서 선언). */
    let sellerId: string | undefined;
    if (requestStore) {
      const request = await requestStore.get(matchRequestId);
      if (!request) {
        res.status(404).json({ error: '정산 대상 요청을 찾을 수 없습니다.' });
        return;
      }
      const amount = request.agreedFee ?? 0;
      if (amount <= 0) {
        res.status(409).json({ error: '확정된 정산 금액이 없습니다.', code: 'NO_AGREED_AMOUNT' });
        return;
      }
      sellerId = request.matchedProviderId;
      const seller = sellerId ? await userStore?.get(sellerId) : undefined;
      // 수취인 역할을 요청 종류에서 정한다. 예전에는 무조건 TRANSPORT 로 넣어서
      // 철거업체·처리장에게 지급할 때도 세금계산서가 "운반" 건으로 발행됐다.
      plan = buildDealSettlementPlan({
        amount,
        party: request.payoutParty,
        completedDate: dateParsed.completedDate,
        holidays: dateParsed.holidays,
        sellerBusinessNumber: seller?.businessNumber,
      });
    } else {
      const parsed = parsePlanInput(req.body);
      if (typeof parsed === 'string') {
        res.status(400).json({ error: parsed });
        return;
      }
      plan = buildSettlementPlan(parsed);
    }

    /**
     * 정산 계좌 확인 — **지급 실행 전에** 막는다.
     *
     * 계좌가 없으면 보낼 곳이 없고, 실명확인 전이면 보내면 안 된다. 계좌번호를 한
     * 자리만 틀려도 남의 통장으로 가고, 되돌리려면 수취인 동의가 필요하다.
     * 지급이 나간 뒤에 알아채면 늦는다.
     */
    if (payoutAccountStore && sellerId) {
      const account = await payoutAccountStore.getRaw(sellerId);
      const usable = canReceivePayout(account);
      if (!usable.ok) {
        res.status(409).json({ error: usable.error, code: 'PAYOUT_ACCOUNT_NOT_READY' });
        return;
      }
    }

    try {
      const payouts = await service.executePayouts(matchRequestId, plan);
      // 전자세금계산서 발행(실패해도 지급 응답을 막지 않음).
      const taxInvoices = await service
        .issueTaxInvoices(matchRequestId, plan)
        .catch(() => []);
      // 처리 완료(COMPLETED) 요청은 정산 완료(SETTLED)로 전이.
      if ((await requestStore?.get(matchRequestId))?.status === 'COMPLETED') {
        try {
          await requestStore?.changeStatus(matchRequestId, 'SETTLED');
        } catch {
          // 상태 전이 실패가 지급 응답을 막지 않게 한다.
        }
      }
      res.json({ settlementDate: plan.settlementDate, payouts, taxInvoices });
    } catch (err) {
      sendPortOneError(res, err, '지급대행 처리 중 오류가 발생했습니다.');
    }
  });

  // POST /api/payments/refund/preview  단계별 환불액 계산(취소 실행 없음)
  router.post('/payments/refund/preview', (req, res) => {
    const parsed = parseRefundInput(req.body);
    if (typeof parsed === 'string') {
      res.status(400).json({ error: parsed });
      return;
    }
    res.json(calculateRefund(parsed));
  });

  // POST /api/payments/cancel  취소/환불 실행 (배차 전 전액 / 배차 후 위약금 10% / 작업 후 불가)
  router.post('/payments/cancel', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const paymentId = body.paymentId;
    if (typeof paymentId !== 'string' || paymentId.trim() === '') {
      res.status(400).json({ error: 'paymentId(문자열)가 필요합니다.' });
      return;
    }
    const stage = body.stage;
    if (typeof stage !== 'string' || !STAGES.includes(stage as CancellationStage)) {
      res.status(400).json({ error: `stage는 ${STAGES.join(' | ')} 중 하나여야 합니다.` });
      return;
    }

    // 결제자 본인 검증 + 환불 기준금액을 기록에서 가져온다(클라이언트 paidAmount 무시).
    let paidAmount: number;
    let matchRequestId: string | undefined;
    if (paymentStore) {
      const payment = await paymentStore.get(paymentId);
      if (!payment) {
        res.status(404).json({ error: '결제 내역을 찾을 수 없습니다.' });
        return;
      }
      if (payment.payerId !== authUserId(req)) {
        res.status(403).json({ error: '본인 결제만 취소할 수 있어요.' });
        return;
      }
      paidAmount = payment.amount;
      matchRequestId = payment.matchRequestId;
    } else {
      // paymentStore 미주입(테스트) 시에만 클라이언트 paidAmount 사용.
      if (typeof body.paidAmount !== 'number' || !Number.isInteger(body.paidAmount) || body.paidAmount < 0) {
        res.status(400).json({ error: 'paidAmount(0 이상 정수)가 필요합니다.' });
        return;
      }
      paidAmount = body.paidAmount;
    }

    const reason = typeof body.reason === 'string' ? body.reason : undefined;

    try {
      const result = await service.cancel({
        paymentId,
        paidAmount,
        stage: stage as CancellationStage,
        reason,
      });
      await paymentStore?.markCancelled(paymentId);
      // 환불 성립 시 해당 요청도 취소 처리(취소 가능 상태일 때만).
      if (requestStore && matchRequestId) {
        const request = await requestStore.get(matchRequestId);
        if (request && (request.status === 'PAID' || request.status === 'MATCHED')) {
          try {
            await requestStore.changeStatus(matchRequestId, 'CANCELLED', {
              cancelReason: reason ?? '결제 취소',
            });
          } catch {
            // 상태 전이 실패가 환불 응답을 막지 않게 한다(환불은 이미 성립).
          }
        }
      }
      res.json(result);
    } catch (err) {
      if (err instanceof CancellationNotAllowedError) {
        res.status(409).json({ error: err.message, code: 'CANCELLATION_NOT_ALLOWED' });
        return;
      }
      sendPortOneError(res, err, '취소/환불 처리 중 오류가 발생했습니다.');
    }
  });

  return router;
}

const STAGES: readonly CancellationStage[] = [
  'BEFORE_DISPATCH',
  'AFTER_DISPATCH',
  'AFTER_WORK_START',
];

/** 환불 입력 파싱 — paidAmount(0 이상 정수) + stage(유효 단계). */
function parseRefundInput(
  body: unknown,
): { paidAmount: number; stage: CancellationStage } | string {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.paidAmount !== 'number' || !Number.isInteger(b.paidAmount) || b.paidAmount < 0) {
    return 'paidAmount(0 이상 정수)가 필요합니다.';
  }
  if (typeof b.stage !== 'string' || !STAGES.includes(b.stage as CancellationStage)) {
    return `stage는 ${STAGES.join(' | ')} 중 하나여야 합니다.`;
  }
  return { paidAmount: b.paidAmount, stage: b.stage as CancellationStage };
}
