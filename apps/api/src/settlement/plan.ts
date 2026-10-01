import {
  calculateDeal,
  type PayoutInstruction,
  type PayoutParty,
  type SettlementPlan,
} from '@dimol/shared';
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

/**
 * 단일 수취인 거래의 정산 플랜 — 이 플랫폼의 실제 거래 형태.
 *
 * 소비자 → 철거업체, 철거업체 → 처리장 두 다리 모두 **결제자 한 명, 수취인 한 명**이다.
 * 아래 buildSettlementPlan 은 "배출자가 운반비+처리비를 한 번에 내고 둘에게 나눠 지급"을
 * 전제해 항상 두 건의 지급 지시를 만든다 — 그러면 금액 0짜리 유령 지급이 생기고,
 * 무엇보다 수취인이 철거업체여도 party 가 TRANSPORT 로 찍혀 세금계산서가 틀어진다.
 */
export function buildDealSettlementPlan(input: {
  /** 합의 금액(결제자가 내는 돈). */
  amount: number;
  /** 수취인 역할. 요청 종류에서 정한다([[marketplace]] payoutPartyForRequestKind). */
  party: PayoutParty;
  /** 처리완료일 'YYYY-MM-DD' (KST). */
  completedDate: string;
  holidays?: ReadonlySet<string>;
  /** 지급 대상 사업자번호(PII). */
  sellerBusinessNumber?: string;
  /**
   * 적용 수수료율. 생략하면 기본 PLATFORM_FEE_RATE. 멤버십 회원은 인하된 값이 들어온다
   * ([[MembershipService]] feeRateFor) — 결제자가 낸 금액은 같고 수취인 몫만 달라진다.
   */
  feeRate?: number;
}): SettlementPlan {
  const deal = calculateDeal(input.amount, input.feeRate);
  return {
    breakdown: {
      // 기존 SettlementBreakdown 계약을 유지하되, 단일 수취인이라 한쪽에만 담는다.
      transportFee: input.party === 'TRANSPORT' ? input.amount : 0,
      disposalFee: input.party === 'DISPOSAL' ? input.amount : 0,
      grossAmount: deal.payerAmount,
      platformFee: deal.platformFee,
      payoutToTransport: input.party === 'TRANSPORT' ? deal.sellerPayout : 0,
      payoutToDisposal: input.party === 'DISPOSAL' ? deal.sellerPayout : 0,
      totalPayout: deal.sellerPayout,
    },
    prepaymentAmount: deal.payerAmount,
    completedDate: input.completedDate,
    settlementDate: calculateSettlementDate(input.completedDate, input.holidays),
    // 지급 지시는 **하나**다. 받는 사람이 한 명이니까.
    payouts: [
      {
        party: input.party,
        amount: deal.sellerPayout,
        businessNumber: input.sellerBusinessNumber,
      },
    ],
  };
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
