import {
  parseFloorCount,
  totalFloorAreaM2,
  type BuildingLedgerInfo,
} from './building-ledger.js';
import { ESTIMATE_RANGE_RATIO, pyeongToM2 } from './estimation.js';
import type { DemolitionDetails } from './request.js';

/**
 * 철거 견적 산정의 계산 근거.
 *
 * 업체는 지금까지 "주소 · 톤수 · 날짜"만 보고 금액을 불렀다. 정작 요청에는 건축물대장
 * 연면적, 소비자가 입력한 바닥면적·층수, 소재별 물량이 다 들어 있는데 화면에 안 나왔다.
 * 여기서는 그 값들로 **견적의 분모가 되는 수치**(연면적·단가 환산)를 만든다.
 *
 * 원칙: 값을 지어내지 않는다. 근거가 없으면 null 을 돌려주고, 화면은 "직접 산정" 으로 둔다.
 */

/** 연면적을 어디서 얻었는지 — 화면에 근거를 같이 보여주기 위한 출처. */
export type FloorAreaSource = 'LEDGER' | 'USER_INPUT';

export interface FloorAreaBasis {
  /** 연면적(㎡, 소수 1자리). */
  m2: number;
  source: FloorAreaSource;
  /** 화면에 그대로 띄우는 근거 문구. */
  note: string;
}

/** '30', '30평', '99.2㎡' 같은 자유 입력에서 숫자만 뽑는다. */
function parseNumber(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const match = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const value = Number(match[0]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 견적의 기준이 되는 연면적(㎡)을 정한다.
 *
 * **건축물대장을 소비자 입력보다 앞에 둔다.** 대장은 공공데이터라 확정 사실이고,
 * 폼의 면적·층수는 기억에 의존한 값이라 자주 틀린다. 대장이 없을 때만 입력값으로
 * 바닥면적 × 층수를 계산한다.
 *
 * `spaceSize` 는 요청 폼에서 '30평' / '99㎡' 처럼 단위를 붙여 저장한다 —
 * ㎡ 표기가 없으면 평으로 보고 환산한다(폼 기본 단위가 평이다).
 */
export function resolveFloorArea(
  details: DemolitionDetails | undefined,
  ledger?: BuildingLedgerInfo | null,
): FloorAreaBasis | null {
  const fromLedger = totalFloorAreaM2(ledger ?? details?.buildingLedger);
  if (fromLedger !== undefined) {
    return {
      m2: fromLedger,
      source: 'LEDGER',
      note: '건축물대장 연면적(공공데이터)',
    };
  }

  const size = parseNumber(details?.spaceSize);
  if (size === undefined) return null;
  const isSquareMeter = (details?.spaceSize ?? '').includes('㎡');
  const perFloor = isSquareMeter ? size : pyeongToM2(size);
  const floors = parseFloorCount(details?.floorCount) ?? 1;

  return {
    m2: round1(perFloor * floors),
    source: 'USER_INPUT',
    note:
      floors > 1
        ? `신청자 입력 — 바닥면적 ${round1(perFloor)}㎡ × ${floors}개 층`
        : `신청자 입력 — 바닥면적 ${round1(perFloor)}㎡`,
  };
}

export interface SuggestedRange {
  minAmount: number;
  maxAmount: number;
  /** 환산에 쓴 연면적(㎡). */
  floorAreaM2: number;
  /** 환산에 쓴 내 단가(원/㎡). */
  unitPrice: number;
}

/**
 * 내 저장 단가(원/㎡) × 연면적 → 개산 범위 제안.
 *
 * 제안일 뿐 자동 제출하지 않는다. 현장 조건(진입·석면·지하)은 단가에 안 들어 있어서
 * 그대로 내면 틀린다 — 업체가 출발점으로 쓰고 직접 고치라고 주는 값이다.
 * 폭은 물량 추정과 같은 비율([[estimation]] ESTIMATE_RANGE_RATIO)을 쓴다.
 */
export function suggestedRange(
  unitPricePerM2: number | null | undefined,
  area: FloorAreaBasis | null,
): SuggestedRange | null {
  if (!area || typeof unitPricePerM2 !== 'number') return null;
  if (!Number.isFinite(unitPricePerM2) || unitPricePerM2 <= 0) return null;

  const mid = unitPricePerM2 * area.m2;
  // 만원 단위로 끊는다 — 1원 단위 제안은 정밀해 보이지만 근거가 없다.
  const toManwon = (n: number) => Math.max(10000, Math.round(n / 10000) * 10000);
  return {
    minAmount: toManwon(mid * (1 - ESTIMATE_RANGE_RATIO)),
    maxAmount: toManwon(mid * (1 + ESTIMATE_RANGE_RATIO)),
    floorAreaM2: area.m2,
    unitPrice: unitPricePerM2,
  };
}

/** 금액 → 연면적 1㎡당 단가(원, 정수). 근거가 없으면 null. */
export function perSquareMeter(amount: number, area: FloorAreaBasis | null): number | null {
  if (!area || area.m2 <= 0) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount / area.m2);
}

/** 금액 → 폐기물 1톤당 단가(원, 정수). 톤수가 없으면 null. */
export function perTon(amount: number, wasteTons: number): number | null {
  if (!Number.isFinite(wasteTons) || wasteTons <= 0) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount / wasteTons);
}

/**
 * 견적을 내기 전에 업체가 반드시 확인해야 하는 항목.
 *
 * 금액을 크게 흔드는 것들만 넣는다 — 다 적으면 아무도 안 읽는다.
 * `missing` 은 "요청에 정보가 없어서 실사 전에는 모르는 것"이고,
 * `caution` 은 "정보가 있는데 금액을 올리는 쪽으로 작용하는 것"이다.
 */
export interface EstimateChecklist {
  caution: string[];
  missing: string[];
}

export function estimateChecklist(
  details: DemolitionDetails | undefined,
  options: { asbestosHigh: boolean; photoCount: number; area: FloorAreaBasis | null },
): EstimateChecklist {
  const caution: string[] = [];
  const missing: string[] = [];

  if (options.asbestosHigh) {
    caution.push('석면 함유 가능성 — 철거 전 석면조사·해체 신고가 필요합니다(비용·기간 증가).');
  }
  if (details?.hasVehicleAccess === false) {
    caution.push('차량·사다리차 진입 불가 — 인력 반출 비용을 반영하세요.');
  }
  if (details?.hasElevator === false) {
    caution.push('엘리베이터 없음 — 상층 폐기물 하역 인력이 추가됩니다.');
  }

  const ledger = details?.buildingLedger;
  if (typeof ledger?.ugrndFlrCnt === 'number' && ledger.ugrndFlrCnt > 0) {
    caution.push(`지하 ${ledger.ugrndFlrCnt}층 — 반출 동선과 잔재 처리를 확인하세요.`);
  }
  if (typeof ledger?.mechParkingCnt === 'number' && ledger.mechParkingCnt > 0) {
    caution.push(`기계식 주차 ${ledger.mechParkingCnt}대 — 해체 전 별도 철거 대상입니다.`);
  }

  if (options.photoCount === 0) {
    missing.push('현장 사진이 없습니다 — 실사 전에는 내부 상태를 알 수 없습니다.');
  }
  if (!options.area) {
    missing.push('연면적 근거가 없습니다 — 면적을 직접 확인하고 산정하세요.');
  }
  if (!details?.demolitionType) {
    missing.push('철거 범위(전체/부분)가 지정되지 않았습니다.');
  }

  return { caution, missing };
}
