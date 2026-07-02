import { PLATFORM_FEE_RATE, type SettlementBreakdown } from '@dimol/shared';

export interface SettlementInput {
  /** 운반비 (원). */
  transportFee: number;
  /** 처리비 (원). */
  disposalFee: number;
}

/**
 * 선결제 총액에서 플랫폼 수수료(7%)를 떼고 운반업체/처리장 정산액을 계산한다.
 *
 * - 수수료율은 @dimol/shared 의 PLATFORM_FEE_RATE 단일 소스만 사용한다 (하드코딩 금지).
 * - 금액은 원 단위 정수로 반올림한다.
 * - 운반/처리 지급액 합계는 항상 totalPayout 과 정확히 일치한다 (반올림 오차는 처리장 쪽에 흡수).
 *
 * ⚠️ CLAUDE.md「사람이 반드시 직접 diff를 검토해야 하는 영역」 — 금액/수수료 계산.
 * 자동 커밋/머지 금지, 반드시 사람이 diff 검토 + 유닛 테스트 통과 후 반영.
 */
export function calculateSettlement({
  transportFee,
  disposalFee,
}: SettlementInput): SettlementBreakdown {
  if (transportFee < 0 || disposalFee < 0) {
    throw new Error('운반비/처리비는 음수일 수 없습니다.');
  }

  const grossAmount = transportFee + disposalFee;
  const platformFee = Math.round(grossAmount * PLATFORM_FEE_RATE);
  const totalPayout = grossAmount - platformFee;

  const payoutToTransport =
    grossAmount === 0 ? 0 : Math.round((transportFee / grossAmount) * totalPayout);
  const payoutToDisposal = totalPayout - payoutToTransport;

  return {
    transportFee,
    disposalFee,
    grossAmount,
    platformFee,
    payoutToTransport,
    payoutToDisposal,
    totalPayout,
  };
}
