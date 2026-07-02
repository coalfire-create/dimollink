import type { CancellationStage, RefundBreakdown, SettlementPlan } from '@dimol/shared';
import { assertCancellable, calculateRefund } from '../settlement/refund.js';
import {
  PortOneClient,
  createPortOneClient,
  type CancelPaymentResult,
  type PayMethod,
  type PayoutResult,
  type PrepaymentResult,
} from './portone-client.js';

/**
 * 결제/정산 오케스트레이션 — 선결제 + 정산일(D+1) 지급대행 실행.
 *
 * 실제 지급은 정산일(plan.settlementDate)에 스케줄러가 executePayouts를 호출해 수행한다.
 * (스케줄러/큐 연결은 DB 연동 시 추가 — 여기서는 실행 진입점만 제공한다.)
 *
 * ⚠️ CLAUDE.md「사람이 반드시 직접 diff를 검토해야 하는 영역」— 결제/정산 로직.
 */
export class PaymentService {
  constructor(private readonly client: PortOneClient = createPortOneClient()) {}

  /** 매칭 확정 시 배출자 선결제(운반비+처리비 총액) 요청. */
  async prepay(
    matchRequestId: string,
    plan: SettlementPlan,
    payMethod?: PayMethod,
  ): Promise<PrepaymentResult> {
    return this.client.requestPrepayment({
      matchRequestId,
      amount: plan.prepaymentAmount,
      payMethod,
    });
  }

  /**
   * 정산일에 셀러별 지급대행 실행. payoutId는 매칭ID+셀러로 구성해 멱등성을 보장한다
   * (재실행/재시도 시 중복 지급 방지). 금액 0 이하 지급 지시는 건너뛴다.
   */
  async executePayouts(matchRequestId: string, plan: SettlementPlan): Promise<PayoutResult[]> {
    const results: PayoutResult[] = [];
    for (const payout of plan.payouts) {
      if (payout.amount <= 0) {
        continue;
      }
      results.push(
        await this.client.createPayout({
          payoutId: `${matchRequestId}-${payout.party}`,
          party: payout.party,
          amount: payout.amount,
          businessNumber: payout.businessNumber,
        }),
      );
    }
    return results;
  }

  /**
   * 취소/환불 처리. 단계별 정책으로 환불액을 계산하고, 취소 불가 단계면 예외를 던진다.
   * 환불액이 있을 때만 포트원 부분/전액 취소를 호출한다(위약금은 플랫폼 보유).
   */
  async cancel(input: {
    paymentId: string;
    paidAmount: number;
    stage: CancellationStage;
    reason?: string;
  }): Promise<{ breakdown: RefundBreakdown; cancellation?: CancelPaymentResult }> {
    const breakdown = calculateRefund({ paidAmount: input.paidAmount, stage: input.stage });
    assertCancellable(breakdown); // 작업 시작 후면 여기서 예외.

    if (breakdown.refundAmount <= 0) {
      // 환불할 금액이 없으면(예: 선결제 0원) 취소만 성립, 포트원 호출 생략.
      return { breakdown };
    }

    const cancellation = await this.client.cancelPayment({
      paymentId: input.paymentId,
      amount: breakdown.refundAmount,
      reason: input.reason,
    });
    return { breakdown, cancellation };
  }
}
