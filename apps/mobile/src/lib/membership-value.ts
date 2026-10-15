import { MEMBER_PLATFORM_FEE_RATE, PLATFORM_FEE_RATE } from '@dimol/shared';

/**
 * 멤버십이 얼마나 이득인지 — 상품 카드에 "사야 하는 이유"를 숫자로 보여 주는 계산.
 *
 * 혜택을 글로만 적으면("수수료 7% → 5%") 업체 대표는 그게 자기 돈으로 얼마인지 다시 계산해야
 * 한다. 실제 수수료율 두 개(공유 상수)와 상품 가격만으로 계산하고, 화면은 결과만 보여 준다.
 *
 * 부동소수점 오차(0.07 - 0.05 = 0.020000000000000004)를 피하려고 요율을 만분율 정수로 바꿔
 * 계산한다 — 손익분기 금액이 1원 어긋나 "294,999원"처럼 보이면 숫자 자체를 의심하게 된다.
 */
const BASIS = 10_000;

/** 회원이 아낄 수수료율(만분율 정수) — 7% → 5% 면 200. */
function savedRateBp(): number {
  return Math.round((PLATFORM_FEE_RATE - MEMBER_PLATFORM_FEE_RATE) * BASIS);
}

/** 하루당 가격(원, 반올림) — "하루 약 197원". */
export function dailyPrice(price: number, days: number): number {
  if (days <= 0) return price;
  return Math.round(price / days);
}

/** 이 정산액에서 회원이 아끼는 수수료(원, 반올림). */
export function feeSavings(settlementAmount: number): number {
  return Math.round((settlementAmount * savedRateBp()) / BASIS);
}

/**
 * 이용권 값을 뽑는 정산액(원, 올림) — 이 금액 이상 정산받으면 아낀 수수료가 이용권 값 이상.
 * 아낄 요율이 없으면(요율이 같아지면) null — 그때는 이 문구를 띄우지 않는다.
 */
export function breakEvenSettlement(price: number): number | null {
  const bp = savedRateBp();
  if (bp <= 0) return null;
  return Math.ceil((price * BASIS) / bp);
}
