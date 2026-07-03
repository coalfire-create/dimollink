import { buildKoreanHolidaySet, type CancellationStage } from '@dimol/shared';
import { Router } from 'express';
import { authUserId } from '../middleware/auth.js';
import { PaymentService } from '../payment/payment-service.js';
import type { PaymentStore } from '../payment/payment-store.js';
import { PortOneError, type PayMethod } from '../payment/portone-client.js';
import type { QuoteStore } from '../quotes/store.js';
import type { RequestStore } from '../requests/store.js';
import { buildSettlementPlan, type BuildSettlementPlanInput } from '../settlement/plan.js';
import { CancellationNotAllowedError, calculateRefund } from '../settlement/refund.js';

/** PortOneError 코드 → HTTP 상태 매핑. */
const STATUS_BY_CODE: Record<string, number> = {
  CONFIG_MISSING: 503,
  LIVE_BLOCKED: 409,
  INVALID_AMOUNT: 400,
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
 * @param requestStore 선결제 요청자 본인 검증용(선택).
 * @param quoteStore   선결제 금액을 수락된 견적에서 산출(금액 권위, 선택). 주입 시 클라이언트 금액 무시.
 * @param paymentStore 결제 기록(취소 시 결제자 검증·환불 기준금액, 선택).
 */
export function createPaymentsRouter(
  service: PaymentService = new PaymentService(),
  requestStore?: RequestStore,
  quoteStore?: QuoteStore,
  paymentStore?: PaymentStore,
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

  // POST /api/settlements/preview  정산 플랜 계산(포트원 호출 없음)
  router.post('/settlements/preview', (req, res) => {
    const parsed = parsePlanInput(req.body);
    if (typeof parsed === 'string') {
      res.status(400).json({ error: parsed });
      return;
    }
    res.json(buildSettlementPlan(parsed));
  });

  // POST /api/payments/prepay  배출자 선결제 요청
  router.post('/payments/prepay', async (req, res) => {
    const matchRequestId = (req.body as { matchRequestId?: unknown })?.matchRequestId;
    if (typeof matchRequestId !== 'string' || matchRequestId.trim() === '') {
      res.status(400).json({ error: 'matchRequestId(문자열)가 필요합니다.' });
      return;
    }
    const payerId = authUserId(req);
    // 선결제는 해당 요청의 요청자(배출자) 본인만.
    if (requestStore) {
      const request = requestStore.get(matchRequestId);
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

    // 금액 권위: 정산 금액은 클라이언트 입력이 아닌 수락된 견적에서 산출한다.
    let fees: { transportFee: number; disposalFee: number };
    if (quoteStore) {
      fees = quoteStore.acceptedFees(matchRequestId);
      if (fees.transportFee + fees.disposalFee <= 0) {
        res.status(409).json({
          error: '수락된 견적이 없어 정산 금액이 확정되지 않았습니다. 견적을 먼저 수락해 주세요.',
          code: 'NO_ACCEPTED_QUOTE',
        });
        return;
      }
    } else {
      // quoteStore 미주입(테스트) 시에만 클라이언트 금액 사용.
      fees = { transportFee: Number(body.transportFee), disposalFee: Number(body.disposalFee) };
    }

    const plan = buildSettlementPlan({
      transportFee: fees.transportFee,
      disposalFee: fees.disposalFee,
      completedDate: dateParsed.completedDate,
      holidays: dateParsed.holidays,
    });
    const payMethod = (req.body as { payMethod?: PayMethod })?.payMethod;

    try {
      const prepayment = await service.prepay(matchRequestId, plan, payMethod);
      paymentStore?.record({
        paymentId: prepayment.paymentId,
        matchRequestId,
        payerId,
        amount: plan.prepaymentAmount,
      });
      res.json({ plan, prepayment });
    } catch (err) {
      sendPortOneError(res, err, '선결제 요청 처리 중 오류가 발생했습니다.');
    }
  });

  // POST /api/payments/payouts  정산일 지급대행 실행(스케줄러 트리거)
  router.post('/payments/payouts', async (req, res) => {
    const matchRequestId = (req.body as { matchRequestId?: unknown })?.matchRequestId;
    if (typeof matchRequestId !== 'string' || matchRequestId.trim() === '') {
      res.status(400).json({ error: 'matchRequestId(문자열)가 필요합니다.' });
      return;
    }
    const parsed = parsePlanInput(req.body);
    if (typeof parsed === 'string') {
      res.status(400).json({ error: parsed });
      return;
    }
    const plan = buildSettlementPlan(parsed);

    try {
      const payouts = await service.executePayouts(matchRequestId, plan);
      res.json({ settlementDate: plan.settlementDate, payouts });
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
    if (paymentStore) {
      const payment = paymentStore.get(paymentId);
      if (!payment) {
        res.status(404).json({ error: '결제 내역을 찾을 수 없습니다.' });
        return;
      }
      if (payment.payerId !== authUserId(req)) {
        res.status(403).json({ error: '본인 결제만 취소할 수 있어요.' });
        return;
      }
      paidAmount = payment.amount;
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
      paymentStore?.markCancelled(paymentId);
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
