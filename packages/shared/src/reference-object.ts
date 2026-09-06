/**
 * 기준 물체로 스케일(실제 치수)을 잡는다.
 *
 * 복원은 크기를 모르고 **비율만** 안다. 현장에 있는 크기를 아는 물건 하나를 3D 화면에서
 * 재면 배율이 나온다 — 인쇄한 마커도, 대장도, AR 지원 기기도 필요 없다.
 *
 * **복원을 다시 돌리지 않는다.** 부피는 배율의 세제곱으로 스케일되므로, 복원 결과에
 * 좌표계 원시 부피(`rawVolumeUnits`)만 남겨 두면 나중에 배율만 다시 곱하면 된다.
 * GPU 재실행이 필요 없다는 뜻이라, 사용자가 여러 번 다시 재도 비용이 0 이다.
 */

/** 현장에서 실제로 구할 수 있는 기준 물체. 길이는 미터. */
export interface ReferenceObject {
  id: string;
  label: string;
  /** 잴 부위 안내 — 무엇의 길이인지 헷갈리면 배율이 통째로 틀린다. */
  hint: string;
  lengthM: number;
}

/**
 * 기준 물체 목록. 철거 현장에서 실제로 눈에 띄는 것들로 골랐다.
 * 인쇄한 마커(ArUco 등)를 전제하지 않는다 — 현장에 프린터가 없다.
 */
export const REFERENCE_OBJECTS: readonly ReferenceObject[] = [
  {
    id: 'A4_LONG',
    label: 'A4 용지 (긴 변)',
    hint: '긴 쪽 끝에서 끝까지',
    lengthM: 0.297,
  },
  {
    id: 'BRICK_KS',
    label: '표준 벽돌 (긴 변)',
    hint: 'KS 표준 벽돌의 긴 면 190mm',
    lengthM: 0.19,
  },
  {
    id: 'DOOR_HEIGHT',
    label: '실내 문 높이',
    hint: '문틀 아래에서 위까지 (보통 2m)',
    lengthM: 2.0,
  },
  {
    id: 'CARD',
    label: '신용카드 (긴 변)',
    hint: '카드 긴 쪽 85.6mm',
    lengthM: 0.0856,
  },
  {
    id: 'BANKNOTE_1000',
    label: '천원권 지폐 (긴 변)',
    hint: '지폐 긴 쪽 136mm',
    lengthM: 0.136,
  },
] as const;

export const REFERENCE_OBJECT_BY_ID: Record<string, ReferenceObject> = Object.fromEntries(
  REFERENCE_OBJECTS.map((o) => [o.id, o]),
);

/** 직접 길이를 입력하는 경우의 상·하한(m). 오타로 말도 안 되는 배율이 나가지 않게. */
export const CUSTOM_REFERENCE_MIN_M = 0.02;
export const CUSTOM_REFERENCE_MAX_M = 50;

/**
 * 배율 위생 검사 범위.
 *
 * 복원 좌표계는 보통 첫 두 카메라 간 거리를 1 로 잡아 건물 규모가 수~수십 단위로 나온다.
 * 배율이 이 범위를 벗어나면 잘못된 지점을 쟀거나(예: 문 높이라며 벽 전체를 잼) 단위를
 * 착각한 것이다 — 그대로 쓰면 부피가 세제곱으로 틀린다.
 */
export const MIN_PLAUSIBLE_SCALE = 0.001;
export const MAX_PLAUSIBLE_SCALE = 1000;

export interface ReferenceMeasurement {
  /** 기준 물체의 실제 길이(m). */
  realLengthM: number;
  /** 3D 화면에서 잰 같은 구간의 길이(복원 좌표계 단위). */
  measuredUnits: number;
}

export type ReferenceScaleResult =
  | { ok: true; factor: number }
  | { ok: false; error: string };

/**
 * 기준 물체 → 길이 배율. 부피가 아니라 **길이** 비라 제곱근·세제곱이 없다.
 *
 * 실패는 예외가 아니라 사유로 돌려준다 — 사용자가 다시 재면 되는 상황이지
 * 스캔 전체를 버릴 상황이 아니다.
 */
export function scaleFactorFromReference(m: ReferenceMeasurement): ReferenceScaleResult {
  if (!Number.isFinite(m.realLengthM) || m.realLengthM <= 0) {
    return { ok: false, error: '기준 물체의 실제 길이를 입력해 주세요.' };
  }
  if (m.realLengthM < CUSTOM_REFERENCE_MIN_M || m.realLengthM > CUSTOM_REFERENCE_MAX_M) {
    return {
      ok: false,
      error: `기준 길이는 ${CUSTOM_REFERENCE_MIN_M}m ~ ${CUSTOM_REFERENCE_MAX_M}m 사이여야 합니다.`,
    };
  }
  if (!Number.isFinite(m.measuredUnits) || m.measuredUnits <= 0) {
    return { ok: false, error: '3D 화면에서 두 점을 찍어 길이를 재 주세요.' };
  }

  const factor = m.realLengthM / m.measuredUnits;
  if (factor < MIN_PLAUSIBLE_SCALE || factor > MAX_PLAUSIBLE_SCALE) {
    return {
      ok: false,
      error: '잰 길이가 기준 물체 크기와 너무 동떨어집니다. 같은 물체의 양 끝을 찍었는지 확인해 주세요.',
    };
  }
  return { ok: true, factor };
}

/**
 * 여러 번 잰 값을 합친다 — **중앙값**을 쓴다.
 *
 * 3D 화면에서 점을 찍는 건 손이 미끄러지기 쉬워 한 번은 크게 빗나갈 수 있다.
 * 평균은 그 한 번에 끌려가지만 중앙값은 버틴다.
 */
export function medianScaleFactor(factors: readonly number[]): number | undefined {
  const valid = factors.filter((f) => Number.isFinite(f) && f > 0).sort((a, b) => a - b);
  if (valid.length === 0) return undefined;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 1 ? valid[mid] : ((valid[mid - 1] ?? 0) + (valid[mid] ?? 0)) / 2;
}

/**
 * 복원 좌표계 원시 부피 → 실제 ㎥. 길이 배율의 **세제곱**이다.
 *
 * 이 함수가 있는 이유: 배율이 바뀌어도 복원을 다시 돌릴 필요가 없다.
 * 사용자가 기준 물체를 다시 재면 여기만 다시 계산하면 된다(GPU 비용 0).
 */
export function volumeFromRawUnits(rawVolumeUnits: number, scaleFactor: number): number {
  if (rawVolumeUnits <= 0 || scaleFactor <= 0) return 0;
  return rawVolumeUnits * scaleFactor ** 3;
}
