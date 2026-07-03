import type { PayoutParty, SettlementPlan } from '@dimol/shared';

/**
 * 정산 대사(로드맵 Phase 2) — 정산 플랜(기대값)과 포트원 지급대행 실제 지급 내역을 비교해
 * 운반비/처리비/수수료 분리 계산이 맞게 집행됐는지 검증한다.
 *
 * - 당사자(운반업체/처리장)별 지급 누락·중복·금액 불일치·지급일 순연 위반을 찾아낸다.
 * - 플랜 자체의 내부 정합성(수수료 + 지급 총액 = 선결제 총액)도 함께 검증한다.
 * - 순수 함수: 외부 호출/저장 없음. 사업자번호 등 PII 는 결과에 포함하지 않는다.
 *
 * ⚠️ CLAUDE.md「사람이 반드시 직접 diff를 검토해야 하는 영역」 — 결제/정산 로직.
 * 자동 커밋/머지 금지, 반드시 사람이 diff 검토 + 유닛 테스트 통과 후 반영.
 */

/** 포트원 지급대행에서 조회한 실제 지급 1건. */
export interface ActualPayout {
  party: PayoutParty;
  /** 실제 지급액(원). */
  amount: number;
  /** 실제 지급일 'YYYY-MM-DD' (KST). */
  paidDate?: string;
}

export type DiscrepancyKind =
  | 'MISSING_PAYOUT' // 지급 누락
  | 'DUPLICATE_PAYOUT' // 같은 당사자에 2건 이상 지급
  | 'AMOUNT_MISMATCH' // 지급액 ≠ 플랜 지급액
  | 'DATE_MISMATCH' // 지급일 ≠ 플랜 정산일(D+1 영업일)
  | 'PLAN_INCONSISTENT'; // 플랜 내부 정합성 위반 (수수료+지급총액 ≠ 선결제 총액)

export interface Discrepancy {
  kind: DiscrepancyKind;
  /** 플랜 정합성 위반은 특정 당사자에 귀속되지 않는다. */
  party?: PayoutParty;
  /** 기대 금액(원) — 금액 관련 항목에서만. */
  expectedAmount?: number;
  /** 실제 금액(원). 누락이면 0, 중복이면 합계. */
  actualAmount?: number;
  expectedDate?: string;
  actualDate?: string;
  /** 관리자 화면 노출용 한글 설명. */
  message: string;
}

export interface ReconciliationResult {
  /** 불일치 0건이면 true — 정산 확정(세금계산서 발행) 진행 가능. */
  matched: boolean;
  discrepancies: Discrepancy[];
}

/** 정산 플랜 vs 실제 지급 내역 대사. */
export function reconcileSettlement(
  plan: SettlementPlan,
  actuals: readonly ActualPayout[],
): ReconciliationResult {
  const discrepancies: Discrepancy[] = [];
  const { breakdown } = plan;

  // 1) 플랜 내부 정합성: 수수료 + 셀러 지급 합계 = 선결제 총액, 지급 지시 합계 = 지급 총액
  const payoutSum = plan.payouts.reduce((sum, p) => sum + p.amount, 0);
  if (
    breakdown.platformFee + breakdown.totalPayout !== breakdown.grossAmount ||
    payoutSum !== breakdown.totalPayout
  ) {
    discrepancies.push({
      kind: 'PLAN_INCONSISTENT',
      expectedAmount: breakdown.grossAmount,
      actualAmount: breakdown.platformFee + payoutSum,
      message: '정산 플랜의 수수료·지급액 분해가 선결제 총액과 맞지 않습니다.',
    });
  }

  // 2) 당사자별 대사: 누락/중복/금액/지급일
  for (const instruction of plan.payouts) {
    const paid = actuals.filter((a) => a.party === instruction.party);

    if (paid.length === 0) {
      discrepancies.push({
        kind: 'MISSING_PAYOUT',
        party: instruction.party,
        expectedAmount: instruction.amount,
        actualAmount: 0,
        message: '지급 내역이 없습니다 (지급 누락).',
      });
      continue;
    }

    const actualSum = paid.reduce((sum, p) => sum + p.amount, 0);
    if (paid.length > 1) {
      discrepancies.push({
        kind: 'DUPLICATE_PAYOUT',
        party: instruction.party,
        expectedAmount: instruction.amount,
        actualAmount: actualSum,
        message: `같은 당사자에게 ${paid.length}건이 지급됐습니다 (중복 지급 의심).`,
      });
    } else if (actualSum !== instruction.amount) {
      discrepancies.push({
        kind: 'AMOUNT_MISMATCH',
        party: instruction.party,
        expectedAmount: instruction.amount,
        actualAmount: actualSum,
        message: '지급액이 정산 플랜 금액과 다릅니다.',
      });
    }

    for (const p of paid) {
      if (p.paidDate !== undefined && p.paidDate !== plan.settlementDate) {
        discrepancies.push({
          kind: 'DATE_MISMATCH',
          party: instruction.party,
          expectedDate: plan.settlementDate,
          actualDate: p.paidDate,
          message: '지급일이 D+1 영업일 정산일과 다릅니다.',
        });
      }
    }
  }

  return { matched: discrepancies.length === 0, discrepancies };
}
