import type { RequestKind, WasteItem } from '@dimol/shared';

/**
 * 요청 폼 검증 — 화면(JSX)에서 떼어낸 순수 함수.
 *
 * 예전에는 submit() 안에서 if 로 하나씩 막고 **첫 오류 하나만** 배너로 띄웠다.
 * 그러면 사용자는 고치고 누르고, 다음 오류를 보고 또 고치는 걸 반복한다.
 * 여기서는 모든 필드를 한 번에 검사해 필드별로 돌려주고, 화면은 각 입력 아래에
 * 그 문구를 붙인다. 어디가 문제인지 찾을 필요가 없어진다.
 *
 * 규칙만 담고 상태는 모른다 — 화면 없이도 검사 결과를 확인할 수 있다.
 */

export type RequestFormField =
  | 'region'
  | 'siteAddress'
  | 'spaceSize'
  | 'floorCount'
  | 'wasteItems'
  | 'loadAddress'
  | 'unloadAddress'
  | 'visitAt';

export type RequestFormErrors = Partial<Record<RequestFormField, string>>;

export interface RequestFormValues {
  kind: RequestKind;
  region: string;
  siteAddress: string;
  spaceSize: string;
  floorCount: string;
  wasteItems: WasteItem[];
  loadAddress: string;
  unloadAddress: string;
  visitAt: string;
}

/** 숫자로 읽히는 면적인지 — "30", "30.5" 는 통과, "삼십평", "-5" 는 오류. */
function invalidPositiveNumber(raw: string): boolean {
  const value = Number(raw.trim());
  return !Number.isFinite(value) || value <= 0;
}

/** YYYY-MM-DD 형태이고 실제로 존재하는 날짜인지. */
function invalidDate(raw: string): boolean {
  const text = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return true;
  const parsed = new Date(`${text}T00:00:00+09:00`);
  return Number.isNaN(parsed.getTime());
}

export function validateRequestForm(values: RequestFormValues): RequestFormErrors {
  const errors: RequestFormErrors = {};

  if (values.region.trim().length === 0) {
    errors.region = '지역을 입력해 주세요. (예: 서울, 경기 양평)';
  }

  if (values.kind === 'DEMOLITION') {
    if (values.siteAddress.trim().length === 0) {
      errors.siteAddress = '현장 주소를 입력해 주세요. 지도에서 위치를 선택하면 됩니다.';
    }
    // 면적·층수는 선택 입력이지만, 적었다면 숫자로 읽혀야 견적에 쓸 수 있다.
    if (values.spaceSize.trim().length > 0 && invalidPositiveNumber(values.spaceSize)) {
      errors.spaceSize = '면적은 숫자로 입력해 주세요. (예: 30)';
    }
    if (values.floorCount.trim().length > 0 && !/\d/.test(values.floorCount)) {
      errors.floorCount = '층수에 숫자가 들어가야 해요. (예: 지상 3층)';
    }
  } else {
    if (values.wasteItems.length === 0) {
      errors.wasteItems = '폐기물 소재를 1개 이상 선택하고 예상 무게(kg)를 입력해 주세요.';
    }
  }

  if (values.kind === 'TRANSPORT') {
    if (values.loadAddress.trim().length === 0) {
      errors.loadAddress = '상차지 주소를 입력해 주세요.';
    }
    if (values.unloadAddress.trim().length === 0) {
      errors.unloadAddress = '하차지 주소를 입력해 주세요.';
    }
  }

  if (values.kind === 'DISPOSAL_RESERVATION') {
    if (values.visitAt.trim().length === 0) {
      errors.visitAt = '방문 희망 날짜를 선택해 주세요.';
    } else if (invalidDate(values.visitAt)) {
      errors.visitAt = '날짜 형식이 올바르지 않아요. 달력에서 다시 선택해 주세요.';
    }
  }

  return errors;
}

export function hasErrors(errors: RequestFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** 배너·토스트에 쓸 요약 문구 — 필드별 문구는 각 입력 아래에 따로 붙는다. */
export function errorSummary(errors: RequestFormErrors): string | null {
  const count = Object.keys(errors).length;
  if (count === 0) return null;
  if (count === 1) return Object.values(errors)[0] ?? null;
  return `입력을 확인해 주세요. 확인이 필요한 항목이 ${count}개 있어요.`;
}
