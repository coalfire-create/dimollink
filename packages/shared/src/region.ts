/**
 * 지역 매칭 — 요청의 현장 지역과 업체의 영업 지역이 같은 곳을 가리키는지 판정한다.
 *
 * 지역은 사용자가 직접 입력하는 자유 문자열이라(가입 시 업체가 쓴 값, 요청 시 소비자가 쓴 값,
 * 지오코딩이 만든 값이 뒤섞인다) 문자열 완전 일치로 비교하면 같은 곳인데도 일감이 도달하지 않는다.
 * 예: 요청 '경기도 양평군' / 업체 '경기 양평', 요청 '양평' / 업체 '경기 양평'.
 *
 * 규칙(보수적):
 *  - 행정구역 접미사(특별시·광역시·도·시·군·구 등)를 떼고 토큰으로 비교한다.
 *  - 한쪽 토큰 집합이 다른 쪽에 모두 포함되면 같은 지역으로 본다(넓은 표기 ⊇ 좁은 표기).
 *    → '경기'(요청) 는 '경기 양평'(업체) 에 도달하고, '양평'(요청) 도 '경기 양평' 에 도달한다.
 *  - 시·군이 서로 다르면(예: '경기 양평' vs '경기 성남') 매칭하지 않는다 — 피드를 넓히는 것은
 *    사업 정책 변경이므로 여기서 임의로 바꾸지 않는다.
 */

/** 행정구역 접미사 — 표기 차이를 흡수하기 위해 제거한다. */
const ADMIN_SUFFIXES = [
  '특별자치시',
  '특별자치도',
  '특별시',
  '광역시',
  '자치시',
  '자치구',
  '시',
  '군',
  '구',
  '도',
  '읍',
  '면',
  '동',
  '리',
];

/** 전국 어디나 받는다는 표기. 어느 지역과도 매칭된다. */
const NATIONWIDE = new Set(['전국', '전국구', '전지역', '전체']);

/** 접미사를 뗀 토큰 하나. 뗀 뒤 비면 원본을 그대로 쓴다('시', '도' 같은 한 글자 입력 보호). */
function stripSuffix(token: string): string {
  for (const suffix of ADMIN_SUFFIXES) {
    if (token.length > suffix.length && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

/**
 * 자유 입력 지역 문자열 → 비교용 토큰 배열.
 * '경기도 양평군' → ['경기','양평'], '서울특별시 강남구' → ['서울','강남'].
 */
export function normalizeRegionTokens(region: string | null | undefined): string[] {
  if (!region) return [];
  return region
    .trim()
    .split(/[\s,·/]+/)
    .map((t) => stripSuffix(t.trim()))
    .filter((t) => t.length > 0);
}

/** 전국 표기인지. */
export function isNationwideRegion(region: string | null | undefined): boolean {
  const tokens = normalizeRegionTokens(region);
  return tokens.length > 0 && tokens.every((t) => NATIONWIDE.has(t));
}

/**
 * 두 지역 표기가 같은 곳을 가리키는지. 순서·접미사·광역만 쓴 표기 차이를 흡수한다.
 * 한쪽이라도 비어 있으면 판정 불가로 보고 false.
 */
export function regionMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  if (isNationwideRegion(a) || isNationwideRegion(b)) return true;
  const left = normalizeRegionTokens(a);
  const right = normalizeRegionTokens(b);
  if (left.length === 0 || right.length === 0) return false;

  const [narrow, wide] = left.length <= right.length ? [left, right] : [right, left];
  const wideSet = new Set(wide);
  return narrow.every((token) => wideSet.has(token));
}
