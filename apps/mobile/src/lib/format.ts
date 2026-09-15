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
