/**
 * 금액 입력 파싱 — 사용자가 "8,000,000" 처럼 쉼표를 넣어도 받는다.
 * 숫자가 아닌 문자는 전부 버리고, 비었으면 0 을 돌려준다(검증은 호출부에서).
 */
export function parseAmount(input: string): number {
  return Number(input.replace(/\D/g, '')) || 0;
}
