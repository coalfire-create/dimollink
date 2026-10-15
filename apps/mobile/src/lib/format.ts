/**
 * 화면 표기 포맷 — 금액·무게처럼 여러 화면이 같은 모양으로 보여줘야 하는 값들.
 *
 * `toLocaleString('ko-KR')` + '원' 을 화면마다 직접 쓰면 어느 곳은 천 단위 구분이 빠지고
 * 어느 곳은 "원"이 붙었다 말았다 한다. 금액은 사용자가 가장 예민하게 보는 값이라
 * 표기가 흔들리면 숫자 자체를 의심하게 된다.
 */

/** 금액(원) — 천 단위 구분 + "원". */
export function won(value: number): string {
  return `${value.toLocaleString('ko-KR')}원`;
}

/** 중량(톤). */
export function tons(value: number): string {
  return `${value.toLocaleString('ko-KR')}톤`;
}

/**
 * 큰 금액(원) → "1,230만 원". 철거비처럼 수백만~수천만 원대 금액은 "12,300,000원"보다
 * 만 원 단위가 훨씬 빨리 읽힌다(고령 사용자). 만 원 미만은 반올림한다.
 */
export function manwon(value: number): string {
  return `${Math.round(value / 10_000).toLocaleString('ko-KR')}만 원`;
}

/**
 * 입력 중인 금액을 말로 읽어 준다 — "8000000" → "800만 원", "12345678" → "1,234만 5,678원".
 *
 * 금액 입력칸은 숫자만 받아서 0 하나를 더 치거나 빼도 눈으로 알아채기 어렵다(고령 업체 대표가
 * 800만 원을 8,000만 원으로 내는 실수). 입력칸 아래에 바로 읽어 준다. [[manwon]] 과 달리
 * 반올림하지 않는다 — 내는 금액은 한 원도 달라 보이면 안 된다. 숫자가 아니면 undefined.
 */
export function amountReadout(raw: string): string | undefined {
  const digits = raw.replace(/[,\s원]/g, '');
  if (!/^\d+$/.test(digits)) return undefined;
  const value = Number(digits);
  if (!Number.isSafeInteger(value) || value <= 0) return undefined;
  if (value < 10_000) return won(value);
  const man = Math.floor(value / 10_000);
  const rest = value % 10_000;
  const manText = `${man.toLocaleString('ko-KR')}만`;
  return rest === 0 ? `${manText} 원` : `${manText} ${rest.toLocaleString('ko-KR')}원`;
}
