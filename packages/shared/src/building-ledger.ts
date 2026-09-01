/**
 * 건축물대장(공공데이터 · 국토교통부 건축물대장 표제부) 정보.
 *
 * 디몰비전 흐름의 1단계 — "현장 주소를 먼저 찍고" 그 주소의 건물이 실제로 어떤 건물인지
 * (주구조·주용도·층수·연면적·사용승인일) 공공데이터로 미리 확인한 뒤, 그 사실을 근거로
 * 사진을 분석한다. 사진만으로는 알 수 없는 정보(특히 사용승인일 → 석면 함유 가능성,
 * 지하층 유무, 실제 연면적)를 AI에 먼저 넘겨 오인식을 줄이고 철거 공정 안내를 정확하게 만든다.
 *
 * 이 파일은 순수 함수만 둔다(네트워크·플랫폼 의존 없음) — api/mobile 양쪽에서 같이 쓴다.
 */

import type { BuildingStructure } from './estimation.js';
import type { BuildingType } from './request.js';

/** 건축물대장 표제부에서 철거 판단에 쓰는 필드. 공공데이터 원본 키 이름을 유지한다. */
export interface BuildingLedgerInfo {
  /** 주구조 (예: 철근콘크리트구조). */
  strctCdNm?: string;
  /** 지붕 (예: (철근)콘크리트, 슬레이트). */
  roofCdNm?: string;
  /** 기타구조(주구조 코드에 없는 구조를 문자열로). */
  etcStrct?: string;
  /** 용적률산정 연면적(㎡). */
  vlRatEstmTotArea?: number;
  /** 연면적(㎡) — 지하 포함 총 바닥면적 합. */
  totArea?: number;
  /** 주용도 (예: 제1종근린생활시설). */
  mainPurpsCdNm?: string;
  /** 지상 층수. */
  grndFlrCnt?: number;
  /** 지하 층수. */
  ugrndFlrCnt?: number;
  /** 사용승인일 (YYYYMMDD). */
  useAprDay?: string;
  /** 건물명(대장상 명칭, 있을 때만). */
  bldNm?: string;

  // ── 토지(대지) 정보 — 표제부·기본개요에서 함께 확보한다 ─────────────────
  /** 대지면적(㎡) — 필지 크기. 장비 진입·야적 공간 판단에 쓴다. */
  platArea?: number;
  /** 건축면적(㎡) — 건물이 지면에 깔린 면적. */
  archArea?: number;
  /** 건폐율(%). */
  bcRat?: number;
  /** 용적률(%). */
  vlRat?: number;
  /** 용도지역 (예: 일반상업지역, 제1종일반주거지역). 철거 인허가 절차를 좌우한다. */
  jiyukCdNm?: string;
  /** 용도지구 (예: 중심지미관지구). */
  jiguCdNm?: string;
  /** 용도구역 (예: 개발제한구역). 있으면 철거 규제가 크게 달라진다. */
  guyukCdNm?: string;

  // ── 해체 계획에 직접 쓰이는 건물 제원 ──────────────────────────────────
  /** 건물 높이(m) — 장비(고소작업차·크레인) 선정 기준. */
  heit?: number;
  /** 승용 승강기 대수. */
  rideUseElvtCnt?: number;
  /** 비상용 승강기 대수. */
  emgenUseElvtCnt?: number;
  /** 기계식 주차 대수(옥내+옥외) — 해체 전 별도 철거 대상. */
  mechParkingCnt?: number;
}

/**
 * 석면 함유 건축자재 사용이 전면 금지된 해(석면안전관리법 시행 · 2009).
 * 사용승인일이 이 해 이전이면 석면 함유 자재가 쓰였을 가능성을 전제로 다뤄야 한다.
 */
export const ASBESTOS_BAN_YEAR = 2009;

/** 석면 조사 의무 강화 기준(2000년대 이전 건축물은 함유 개연성이 특히 높다). */
export const ASBESTOS_HIGH_RISK_YEAR = 2000;

export type AsbestosRisk = 'HIGH' | 'POSSIBLE' | 'LOW' | 'UNKNOWN';

export const ASBESTOS_RISK_LABELS: Record<AsbestosRisk, string> = {
  HIGH: '석면 함유 가능성 높음',
  POSSIBLE: '석면 함유 가능성 있음',
  LOW: '석면 함유 가능성 낮음',
  UNKNOWN: '사용승인일 확인 불가',
};

/** 'YYYYMMDD' → 연도(숫자). 파싱 불가면 undefined. */
export function approvalYear(useAprDay: string | undefined): number | undefined {
  if (!useAprDay) return undefined;
  const digits = useAprDay.replace(/\D/g, '');
  if (digits.length < 4) return undefined;
  const year = Number(digits.slice(0, 4));
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return undefined;
  return year;
}

/** 'YYYYMMDD' → '1998. 03. 21.' 사람이 읽는 형태. */
export function formatApprovalDay(useAprDay: string | undefined): string | undefined {
  const digits = (useAprDay ?? '').replace(/\D/g, '');
  if (digits.length !== 8) return approvalYear(useAprDay) ? `${approvalYear(useAprDay)}년` : undefined;
  return `${digits.slice(0, 4)}. ${digits.slice(4, 6)}. ${digits.slice(6, 8)}.`;
}

/**
 * 사용승인일·지붕재로 석면 위험도를 판정한다. 사진만으로는 알 수 없는 정보라
 * 디몰비전 분석 전에 미리 확보해 두는 것이 이 판정의 목적이다.
 * 판정은 참고용이며, 실제 철거 전 석면조사(석면안전관리법)를 대체하지 않는다.
 */
export function asbestosRisk(info: BuildingLedgerInfo | null | undefined): AsbestosRisk {
  if (!info) return 'UNKNOWN';
  const roof = `${info.roofCdNm ?? ''}${info.etcStrct ?? ''}`;
  // 슬레이트 지붕은 연도와 무관하게 석면 슬레이트를 최우선 의심한다.
  if (roof.includes('슬레이트')) return 'HIGH';

  const year = approvalYear(info.useAprDay);
  if (year === undefined) return 'UNKNOWN';
  if (year < ASBESTOS_HIGH_RISK_YEAR) return 'HIGH';
  if (year <= ASBESTOS_BAN_YEAR) return 'POSSIBLE';
  return 'LOW';
}

/** 주구조 문자열(대장 표기) → 물량 추정용 구조 코드. 매칭 실패 시 undefined. */
export function structureCodeOf(
  info: BuildingLedgerInfo | null | undefined,
): BuildingStructure | undefined {
  const text = `${info?.strctCdNm ?? ''} ${info?.etcStrct ?? ''}`.replace(/\s/g, '');
  if (!text.trim()) return undefined;
  if (text.includes('목구조') || text.includes('목조')) return 'WOOD';
  // 경량철골·샌드위치판넬은 골조가 가볍고 마감이 판넬이라 콘크리트조와 발생량이 크게 다르다.
  // '철골' 문자열을 포함하므로 중량 구조 판정보다 반드시 먼저 걸러야 한다.
  if (text.includes('경량철골') || text.includes('경량철구') || text.includes('판넬') || text.includes('패널')) {
    return 'BRICK';
  }
  if (text.includes('블록') || text.includes('벽돌') || text.includes('조적') || text.includes('연와'))
    return 'BRICK';
  // 철근콘크리트·(중량)철골·철골철근콘크리트·라멘 등 중량 구조는 RC 원단위로 본다.
  if (text.includes('콘크리트') || text.includes('철골') || text.includes('철파이프')) return 'RC';
  return undefined;
}

/** 주용도 문자열(대장 표기) → 요청서 건물 종류. 매칭 실패 시 undefined. */
export function buildingTypeOf(
  info: BuildingLedgerInfo | null | undefined,
): BuildingType | undefined {
  const purpose = (info?.mainPurpsCdNm ?? '').replace(/\s/g, '');
  if (!purpose) return undefined;
  if (purpose.includes('아파트') || purpose.includes('연립') || purpose.includes('다세대'))
    return 'APARTMENT';
  if (purpose.includes('단독주택') || purpose.includes('다가구') || purpose.includes('주택'))
    return 'HOUSING';
  if (purpose.includes('공장') || purpose.includes('창고')) return 'FACTORY';
  if (purpose.includes('업무') || purpose.includes('사무')) return 'OFFICE';
  if (purpose.includes('근린생활') || purpose.includes('판매') || purpose.includes('상업'))
    return 'COMMERCIAL';
  return 'OTHER';
}

/** 승강기 총 대수(승용+비상용). 정보가 없으면 undefined(0 과 구분한다). */
export function elevatorCount(info: BuildingLedgerInfo | null | undefined): number | undefined {
  const ride = info?.rideUseElvtCnt;
  const emgen = info?.emgenUseElvtCnt;
  if (typeof ride !== 'number' && typeof emgen !== 'number') return undefined;
  return (typeof ride === 'number' ? ride : 0) + (typeof emgen === 'number' ? emgen : 0);
}

/** 용도지역/지구/구역을 한 줄로. 값이 없으면 undefined. */
export function zoningLabel(info: BuildingLedgerInfo | null | undefined): string | undefined {
  const parts = [info?.jiyukCdNm, info?.jiguCdNm, info?.guyukCdNm]
    .map((v) => (v ?? '').trim())
    .filter((v) => v.length > 0);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/**
 * 철거 규제가 특별히 강한 용도구역인지(개발제한구역·문화재보호구역 등).
 * 해당하면 해체계획 승인 절차가 달라지므로 사용자와 AI 양쪽에 먼저 알린다.
 */
export function hasRestrictedZone(info: BuildingLedgerInfo | null | undefined): boolean {
  const text = `${info?.guyukCdNm ?? ''}${info?.jiguCdNm ?? ''}`.replace(/\s/g, '');
  if (!text) return false;
  return ['개발제한', '문화재', '보호구역', '군사', '수변', '경관'].some((k) => text.includes(k));
}

/** 대장상 연면적(㎡). 연면적이 없으면 용적률산정연면적으로 대체. */
export function totalFloorAreaM2(info: BuildingLedgerInfo | null | undefined): number | undefined {
  const value = info?.totArea ?? info?.vlRatEstmTotArea;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value * 10) / 10;
}

/** '지상 3층 / 지하 1층' 형태의 층수 표기. 정보가 없으면 undefined. */
export function floorLabel(info: BuildingLedgerInfo | null | undefined): string | undefined {
  const up = info?.grndFlrCnt;
  const down = info?.ugrndFlrCnt;
  const parts: string[] = [];
  if (typeof up === 'number' && up > 0) parts.push(`지상 ${up}층`);
  if (typeof down === 'number' && down > 0) parts.push(`지하 ${down}층`);
  return parts.length > 0 ? parts.join(' / ') : undefined;
}

/** 대장상 총 층수(지상+지하). 물량 계산에서 한 층 바닥면적을 만들 때 쓴다. */
export function totalFloorCount(info: BuildingLedgerInfo | null | undefined): number | undefined {
  const up = typeof info?.grndFlrCnt === 'number' && info.grndFlrCnt > 0 ? info.grndFlrCnt : 0;
  const down = typeof info?.ugrndFlrCnt === 'number' && info.ugrndFlrCnt > 0 ? info.ugrndFlrCnt : 0;
  const total = up + down;
  return total > 0 ? total : undefined;
}

/**
 * '지상 2층 / 지하 1층', '3층', '2' 같은 자유 입력에서 총 층수를 뽑는다.
 * 폼의 층수 칸은 사용자가 자유롭게 쓰는 곳이라, 숫자를 못 찾으면 undefined 로 둔다.
 */
export function parseFloorCount(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const matches = text.match(/\d+(?:\.\d+)?/g);
  if (!matches) return undefined;
  const total = matches.reduce((sum, m) => sum + Math.floor(Number(m)), 0);
  return Number.isFinite(total) && total > 0 ? total : undefined;
}

/** 대장 연면적을 층수로 나눈 한 층 바닥면적(㎡). 층수를 모르면 연면적 그대로. */
export function perFloorAreaM2(info: BuildingLedgerInfo | null | undefined): number | undefined {
  const total = totalFloorAreaM2(info);
  if (total === undefined) return undefined;
  const floors = totalFloorCount(info) ?? 1;
  return Math.round((total / floors) * 10) / 10;
}

/** 대장 정보에 실제로 쓸 만한 값이 하나라도 있는지. */
export function hasLedgerData(info: BuildingLedgerInfo | null | undefined): boolean {
  if (!info) return false;
  return Boolean(
    info.strctCdNm ||
      info.mainPurpsCdNm ||
      info.roofCdNm ||
      info.useAprDay ||
      totalFloorAreaM2(info) ||
      floorLabel(info) ||
      info.platArea ||
      zoningLabel(info),
  );
}

/** 화면 표시용 항목 목록(값이 있는 것만). */
export function ledgerDisplayRows(
  info: BuildingLedgerInfo | null | undefined,
): Array<{ label: string; value: string }> {
  if (!info) return [];
  const rows: Array<{ label: string; value: string }> = [];
  if (info.mainPurpsCdNm) rows.push({ label: '주용도', value: info.mainPurpsCdNm });
  if (info.strctCdNm) rows.push({ label: '주구조', value: info.strctCdNm });
  if (info.roofCdNm) rows.push({ label: '지붕', value: info.roofCdNm });
  const floors = floorLabel(info);
  if (floors) rows.push({ label: '층수', value: floors });
  const area = totalFloorAreaM2(info);
  if (area) rows.push({ label: '연면적', value: `${area.toLocaleString('ko-KR')}㎡` });
  if (info.platArea) rows.push({ label: '대지면적', value: `${info.platArea.toLocaleString('ko-KR')}㎡` });
  const zoning = zoningLabel(info);
  if (zoning) rows.push({ label: '용도지역', value: zoning });
  if (typeof info.heit === 'number' && info.heit > 0) {
    rows.push({ label: '건물 높이', value: `${info.heit}m` });
  }
  const elevators = elevatorCount(info);
  if (elevators !== undefined) {
    rows.push({ label: '승강기', value: elevators > 0 ? `${elevators}대` : '없음' });
  }
  const approved = formatApprovalDay(info.useAprDay);
  if (approved) rows.push({ label: '사용승인일', value: approved });
  return rows;
}

/**
 * 디몰비전(비전 AI)에 먼저 넘길 건물 사실 정보 문장.
 * "사진을 보기 전에 이미 알고 있는 것"을 명시해 오인식과 추측을 줄인다.
 */
export function buildingFactsForVision(info: BuildingLedgerInfo | null | undefined): string | null {
  if (!hasLedgerData(info) || !info) return null;
  const facts: string[] = [];
  if (info.mainPurpsCdNm) facts.push(`주용도 ${info.mainPurpsCdNm}`);
  if (info.strctCdNm) facts.push(`주구조 ${info.strctCdNm}`);
  if (info.etcStrct) facts.push(`기타구조 ${info.etcStrct}`);
  if (info.roofCdNm) facts.push(`지붕 ${info.roofCdNm}`);
  const floors = floorLabel(info);
  if (floors) facts.push(floors);
  const area = totalFloorAreaM2(info);
  if (area) facts.push(`연면적 ${area}㎡`);
  if (info.platArea) facts.push(`대지면적 ${info.platArea}㎡`);
  if (typeof info.heit === 'number' && info.heit > 0) facts.push(`건물높이 ${info.heit}m`);
  const zoning = zoningLabel(info);
  if (zoning) facts.push(`용도지역 ${zoning}`);
  const year = approvalYear(info.useAprDay);
  if (year) facts.push(`사용승인 ${year}년`);

  const lines = [
    `[건축물대장 확인 사실] 이 현장의 건물은 공공데이터(건축물대장 표제부)상 ${facts.join(', ')} 입니다.`,
    '이 값들은 사진보다 신뢰도가 높은 확정 정보이므로, 사진 판독 결과가 이와 어긋나면 대장 정보를 우선하고 소재 오인식을 바로잡으세요.',
  ];

  const risk = asbestosRisk(info);
  if (risk === 'HIGH' || risk === 'POSSIBLE') {
    const reason = year
      ? `사용승인 ${year}년(석면 함유 자재 사용 금지 ${ASBESTOS_BAN_YEAR}년 이전)`
      : '슬레이트 지붕';
    lines.push(
      `[석면 주의] ${reason}이므로 석면 함유 자재(슬레이트, 텍스 천장재, 밤라이트, 배관 보온재 등)가 쓰였을 수 있습니다. ` +
        'hazards 에 석면 사전조사 의무를 반드시 포함하고, 해당 자재는 hazardous=true 로 표시하며 임의 제거를 권하지 마세요.',
    );
  } else if (risk === 'LOW' && year) {
    lines.push(
      `[석면 참고] 사용승인 ${year}년으로 ${ASBESTOS_BAN_YEAR}년 이후 건축물입니다. 사진에서 명확한 근거가 없으면 석면을 과도하게 추정하지 마세요.`,
    );
  }

  if (typeof info.ugrndFlrCnt === 'number' && info.ugrndFlrCnt > 0) {
    lines.push(
      `[지하층] 지하 ${info.ugrndFlrCnt}개 층이 있습니다. 사진에 보이지 않더라도 지하 구조물 해체·되메우기 공정을 demolitionSteps 에 포함하세요.`,
    );
  }

  // 높이는 장비 선정(고소작업차·크레인·압쇄기 도달범위)을 좌우한다.
  if (typeof info.heit === 'number' && info.heit >= 12) {
    lines.push(
      `[높이] 건물 높이 ${info.heit}m 입니다. 지상 장비만으로는 상부 도달이 어려우므로 ` +
        '고소 해체 장비·낙하물 방지망·비계 계획을 demolitionSteps 에 포함하세요.',
    );
  }

  // 대지면적 대비 건축면적은 장비 진입·야적 여유를 가늠하게 한다.
  if (info.platArea && info.archArea && info.platArea > 0) {
    const spare = Math.round(info.platArea - info.archArea);
    if (spare >= 0 && spare < 50) {
      lines.push(
        `[협소 부지] 대지 ${info.platArea}㎡ 중 건축면적이 ${info.archArea}㎡ 로 여유 공간이 약 ${spare}㎡ 뿐입니다. ` +
          '장비 진입·폐기물 야적 공간이 부족한 현장으로 보고 소형 장비·즉시 반출 계획을 제안하세요.',
      );
    }
  }

  const elevators = elevatorCount(info);
  if (elevators !== undefined && elevators > 0) {
    lines.push(`[승강기] 승강기 ${elevators}대가 설치돼 있습니다. 승강기 본체·권상기·레일 해체를 별도 공정으로 잡으세요.`);
  }
  if (typeof info.mechParkingCnt === 'number' && info.mechParkingCnt > 0) {
    lines.push(
      `[기계식주차] 기계식 주차설비 ${info.mechParkingCnt}대분이 있습니다. 철골 구조물이라 본 해체 전에 별도 철거·고철 분리가 필요합니다.`,
    );
  }

  if (hasRestrictedZone(info)) {
    const zone = zoningLabel(info) ?? '규제 구역';
    lines.push(
      `[규제 구역] 이 필지는 '${zone}' 에 속합니다. 일반 해체신고로 끝나지 않고 별도 허가·심의가 필요할 수 있으므로 ` +
        'hazards 에 관할 지자체 사전 확인 필요를 명시하세요.',
    );
  }

  return lines.join('\n');
}
