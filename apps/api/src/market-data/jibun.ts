/**
 * 나라장터 공사명 속 지번("인사동 9-2번지 외 2동 철거공사")을 법정동코드+본번/부번으로 바꾼다.
 * 공사명에는 시·군·구가 없으므로 발주 기관명("경상남도 진주시", "평창군산림조합")으로 좁힌다.
 */

export interface Jibun {
  /** 공사명에서 읽은 동·리·가 이름(앞에 붙은 글자가 섞여 있을 수 있다 — 법정동 표에서 뒤부터 맞춘다). */
  word: string;
  san: boolean;
  bun: number;
  ji: number;
  /** "외 2동", "3개동"처럼 여러 동을 한꺼번에 철거하는 공사. */
  multiBuilding: boolean;
}

/** 지번 뒤에 이 글자가 오면 지번이 아니다(8통, 3반, 12길, 5호 …). */
const NOT_JIBUN_SUFFIX = /^\s*(통|반|길|로|호|층|차|권|년|개소|필지|m|㎡)/;

export function parseJibun(name: string): Jibun | undefined {
  const re = /([가-힣]+\d*(?:동|리|가))\s*(산\s*)?(\d{1,5})(?:\s*-\s*(\d{1,5}))?(?:\s*번지)?/g;
  for (const m of name.matchAll(re)) {
    const rest = name.slice((m.index ?? 0) + m[0].length);
    if (!m[4] && NOT_JIBUN_SUFFIX.test(rest)) continue;
    return {
      word: m[1] ?? '',
      san: Boolean(m[2]),
      bun: Number(m[3]),
      ji: Number(m[4] ?? 0),
      multiBuilding: /외\s*\d+\s*동|\d+\s*개\s*동|\d+\s*동\)/.test(name),
    };
  }
  return undefined;
}

export interface LegalDong {
  code: string;
  /** "경상남도 진주시 인사동" */
  fullName: string;
}

/** 국토교통부 법정동코드 CSV(법정동코드,법정동명,폐지여부) → 현존 동·리만, 마지막 이름으로 묶음. */
export function buildLegalDongIndex(csv: string): Map<string, LegalDong[]> {
  const index = new Map<string, LegalDong[]>();
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const [code, fullName, status] = line.split(',');
    if (!code || !fullName || status?.trim() !== '존재') continue;
    if (code.endsWith('00000')) continue; // 시·도, 시·군·구 행
    const last = fullName.trim().split(/\s+/).pop() ?? '';
    if (!/(동|리|가)$/.test(last)) continue; // 읍·면 행
    index.set(last, [...(index.get(last) ?? []), { code, fullName: fullName.trim() }]);
  }
  return index;
}

/** 시·도 약칭이 기관명에 쓰이는 경우("경남교육청", "서울시"). */
const SIDO_SHORT: Record<string, string> = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  경기도: '경기',
  강원특별자치도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전북특별자치도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주특별자치도: '제주',
};

/**
 * 공사명의 동 이름 + 기관명 → 법정동 1개. 확신할 수 없으면 undefined.
 * - 동 이름은 앞 글자가 붙어 있을 수 있어("사업대봉동") 뒤에서부터 가장 긴 일치를 찾는다.
 * - 후보가 여럿이면 기관명에 시·군·구가 들어 있는 후보만 남긴다. 그래도 여럿이면 버린다
 *   (엉뚱한 건물의 연면적을 붙이느니 표본에서 빼는 게 낫다).
 */
export function resolveLegalDong(
  word: string,
  agency: string | undefined,
  index: Map<string, LegalDong[]>,
): LegalDong | undefined {
  let candidates: LegalDong[] | undefined;
  for (let i = 0; i <= word.length - 2 && !candidates; i++) candidates = index.get(word.slice(i));
  if (!candidates || candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  const org = (agency ?? '').replace(/\s/g, '');
  const scored = candidates
    .map((c) => {
      const parts = c.fullName.split(/\s+/).slice(0, -1);
      // 시·군·구(두 번째 이후 토큰) 일치가 핵심. "진주시" → "진주"도 허용.
      const local = parts
        .slice(1)
        .filter((p) => !/(읍|면)$/.test(p))
        .some((p) => org.includes(p) || org.includes(p.replace(/(시|군|구)$/, '')));
      const sido = parts[0]
        ? org.includes(parts[0]) || org.includes(SIDO_SHORT[parts[0]] ?? '∅')
        : false;
      return { c, score: (local ? 2 : 0) + (sido ? 1 : 0) };
    })
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return undefined;
  if (scored.length > 1 && scored[0]?.score === scored[1]?.score) return undefined;
  return scored[0]?.c;
}
