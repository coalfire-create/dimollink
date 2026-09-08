import { PLATFORM_FEE_RATE } from './constants.js';
import type { PayoutParty } from './types.js';
import type { RequestKind } from './request.js';

/**
 * 마켓플레이스 거래 — **누가 누구에게 얼마를 내고, 플랫폼이 얼마를 갖는가**.
 *
 * 이 플랫폼의 돈 흐름은 두 다리다:
 *   1. 소비자 → 철거업체   (철거비)
 *   2. 철거업체 → 처리장   (처리비)
 * 각 다리는 **결제자 한 명, 수취인 한 명**인 별개의 거래이고, 플랫폼은 각 거래에서
 * 수수료를 갖는다. 상품을 파는 게 아니라 거래를 중개하는 구조다.
 *
 * 기존 정산 모델은 "배출자가 운반비+처리비를 한 번에 내고 둘에게 나눠 지급"을 전제해
 * 수취인이 항상 둘이었다. 두 다리 구조에서는 거래마다 수취인이 하나뿐이라, 나머지
 * 하나는 금액 0짜리 유령 지급이 되고 party 라벨도 틀어진다.
 */

/**
 * 요청 종류 → 이 거래의 수취인 역할.
 *
 * 라벨이 틀리면 지급 멱등키(`요청id-party`)와 세금계산서 발행 건명이 함께 틀어진다.
 * B2B 거래라 세금계산서가 실제 업종과 다르면 그대로 회계 문제가 된다.
 */
export function payoutPartyForRequestKind(kind: RequestKind): PayoutParty {
  switch (kind) {
    case 'DEMOLITION':
      return 'DEMOLITION';
    case 'DISPOSAL_RESERVATION':
      return 'DISPOSAL';
    case 'TRANSPORT':
    default:
      return 'TRANSPORT';
  }
}

/** 한 거래의 금액 분해. 결제자가 내는 돈과 수취인이 받는 돈, 그 차이가 플랫폼 몫. */
export interface DealBreakdown {
  /** 결제자가 실제로 내는 금액(합의 금액). */
  payerAmount: number;
  /** 플랫폼 수수료(원, 반올림). */
  platformFee: number;
  /** 수취인이 받는 금액. */
  sellerPayout: number;
  /** 적용된 수수료율. 화면에 "7%"로 표시할 때 쓴다. */
  feeRate: number;
}

/**
 * 거래 금액을 분해한다.
 *
 * 수수료는 **수취인 지급액에서 차감**한다(결제자에게 별도로 더 받지 않는다).
 * 결제자가 보는 금액과 실제 청구액이 같아야 하고, 다르면 결제 화면에서 신뢰를 잃는다.
 */
export function calculateDeal(payerAmount: number, feeRate = PLATFORM_FEE_RATE): DealBreakdown {
  if (!Number.isFinite(payerAmount) || payerAmount < 0) {
    throw new Error('거래 금액은 0 이상이어야 합니다.');
  }
  const platformFee = Math.round(payerAmount * feeRate);
  return {
    payerAmount,
    platformFee,
    sellerPayout: payerAmount - platformFee,
    feeRate,
  };
}

/** 결제 화면에 그대로 띄우는 한 줄 설명. 수수료가 어디서 나가는지 숨기지 않는다. */
export function describeDealFee(breakdown: DealBreakdown): string {
  const pct = Math.round(breakdown.feeRate * 1000) / 10;
  return `결제 금액 ${breakdown.payerAmount.toLocaleString('ko-KR')}원 · 플랫폼 수수료 ${pct}%(${breakdown.platformFee.toLocaleString('ko-KR')}원)는 업체 정산액에서 차감됩니다.`;
}
