import type { PayoutInstruction, SettlementPlan } from '@dimol/shared';
import { calculateSettlement } from './calculate.js';
import { calculateSettlementDate } from './settlement-date.js';

/**
 * 정산 플랜 빌더 — 금액 분해(수수료 7% 차감) + 지급일(D+1 영업일) + 셀러별 지급 지시를
 * 하나로 묶어 포트원 지급대행 실행에 필요한 정보를 만든다.
 *
 * 선결제 금액(prepaymentAmount)은 기존 calculate.ts 모델을 따른다:
 *   배출자 선결제 = 운반비 + 처리비(grossAmount), 수수료는 정산 시 셀러 지급액에서 차감.
 * ⚠️ CLAUDE.md 결제 규칙은 "총 금액(운반비+처리비+수수료)"으로도 읽혀 선결제 청구 모델이
 *   달라질 수 있다. 이 부분은 사람 검토 시 확정한다(정산/결제 = 사람 diff 검토 영역).
 */

export interface BuildSettlementPlanInput {
  transportFee: number;
  disposalFee: number;
  /** 처리완료일 'YYYY-MM-DD' (KST). */
  completedDate: string;
  /** 공휴일 셋('YYYY-MM-DD'). 미주입 시 주말만 순연. */
  holidays?: ReadonlySet<string>;
  /** 지급 대상 사업자번호(PII, 선택). */
  transportBusinessNumber?: string;
  disposalBusinessNumber?: string;
}

export function buildSettlementPlan(input: BuildSettlementPlanInput): SettlementPlan {
  const breakdown = calculateSettlement({
    transportFee: input.transportFee,
    disposalFee: input.disposalFee,
  });
  const settlementDate = calculateSettlementDate(input.completedDate, input.holidays);

  const payouts: PayoutInstruction[] = [
    {
      party: 'TRANSPORT',
      amount: breakdown.payoutToTransport,
      businessNumber: input.transportBusinessNumber,
    },
    {
      party: 'DISPOSAL',
      amount: breakdown.payoutToDisposal,
      businessNumber: input.disposalBusinessNumber,
    },
  ];

  return {
    breakdown,
    prepaymentAmount: breakdown.grossAmount,
    completedDate: input.completedDate,
    settlementDate,
    payouts,
  };
}
