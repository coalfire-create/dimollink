/**
 * 3D 스캔 실측 부피 → 폐기물 물량 산정.
 *
 * 기존 산정은 **연면적 × 원단위**였다(`estimation.ts`). 통계로는 맞지만 두 가지를 못 본다.
 *   - **층고**: 연면적이 같아도 층고 2.4m 창고와 4.5m 공장은 물량이 배 가까이 다르다.
 *   - **대장에 없는 것**: 증축부·부속 건물·마당 적치물은 연면적에 안 잡힌다.
 *
 * 3D 복원으로 **외피 부피(㎥)** 를 실측하면 둘 다 잡힌다. 부피 원단위는 면적 원단위를
 * 기준 층고로 나눈 값으로 두어, **층고가 3m 인 표준 건물에서는 두 방법이 같은 답**을 내고
 * 층고가 다를 때만 갈라지도록 했다. 새 상수를 지어내지 않고 기존 검증값과 정합을 유지한다.
 *
 * 산정된 총량을 성상별로 나누는 것은 [[waste-composition]] 이 그대로 담당한다 —
 * 바뀌는 것은 "총량을 어떻게 얻는가" 하나뿐이다.
 */

import {
  DEMOLITION_TON_PER_M2,
  ESTIMATE_RANGE_RATIO,
  STRUCTURE_FACTORS,
  type BuildingStructure,
} from './estimation.js';

/**
 * 부피 원단위를 유도할 때 쓰는 기준 층고(m).
 * 면적 원단위(t/㎡)를 이 값으로 나눠 부피 원단위(t/㎥)를 만든다.
 */
export const REFERENCE_STOREY_HEIGHT_M = 3.0;

/**
 * 외피 부피 1㎥ 당 철거 폐기물 발생량(톤).
 * 면적 원단위 ÷ 기준 층고 — 층고 3m 건물에서 두 방법이 일치하도록 유도한 값이다.
 * (RC 기준 1.58 ÷ 3.0 ≈ 0.53 t/㎥)
 */
export const WASTE_TON_PER_GROSS_M3: Record<BuildingStructure, number> = {
  RC: (DEMOLITION_TON_PER_M2 * STRUCTURE_FACTORS.RC) / REFERENCE_STOREY_HEIGHT_M,
  BRICK: (DEMOLITION_TON_PER_M2 * STRUCTURE_FACTORS.BRICK) / REFERENCE_STOREY_HEIGHT_M,
  WOOD: (DEMOLITION_TON_PER_M2 * STRUCTURE_FACTORS.WOOD) / REFERENCE_STOREY_HEIGHT_M,
};

/** 스케일(실제 치수)을 어디서 얻었는지. 부피 신뢰도를 좌우하는 가장 중요한 값이다. */
export type ScanScaleSource =
  /** ARKit/ARCore 포즈 — 미터 단위가 기기에서 직접 나온다. 가장 정확. */
  | 'AR_POSE'
  /** 기준 물체(A4 용지·줄자 등)를 함께 촬영해 역산. */
  | 'REFERENCE_OBJECT'
  /** 건축물대장 연면적으로 역산 — 대장이 맞다는 전제. 폴백. */
  | 'LEDGER_AREA'
  /** 스케일 근거 없음 — 부피를 쓸 수 없다. */
  | 'NONE';

export const SCAN_SCALE_SOURCE_LABELS: Record<ScanScaleSource, string> = {
  AR_POSE: '기기 AR 측위(미터 단위 직접 측정)',
  REFERENCE_OBJECT: '기준 물체 대조',
  LEDGER_AREA: '건축물대장 연면적 역산',
  NONE: '스케일 근거 없음',
};

/**
 * 스케일 출처별 부피 오차폭(±비율).
 * AR 포즈는 기기가 미터를 직접 재므로 좁고, 대장 역산은 대장 자체 오차가 얹혀 넓다.
 */
export const SCALE_SOURCE_ERROR_RATIO: Record<ScanScaleSource, number> = {
  AR_POSE: 0.1,
  REFERENCE_OBJECT: 0.15,
  LEDGER_AREA: 0.25,
  NONE: 1,
};

/**
 * 복원 품질 — 철거 현장은 포토그래메트리에 불리하다(도장 콘크리트·판넬은 특징점이 없고,
 * 유리·금속은 보는 각도마다 색이 달라 복원이 깨진다). 품질이 나쁜 스캔의 부피를
 * 그대로 쓰면 원단위 추정보다 오히려 나빠지므로, 반드시 게이트를 통과시킨다.
 */
export interface Scan3DQuality {
  /** 복원에 성공적으로 정렬된 사진 비율(0~1). COLMAP 이 등록한 이미지 / 입력 이미지. */
  registeredRatio: number;
  /** 복원 점군 수. 너무 적으면 형상이 없는 것과 같다. */
  pointCount: number;
  /** 외피가 닫혀 있는지(구멍 없이 부피를 잴 수 있는지). */
  watertight: boolean;
}

/** 부피를 신뢰하려면 이 비율 이상의 사진이 정렬돼야 한다. */
export const MIN_REGISTERED_RATIO = 0.7;
/** 부피를 신뢰하려면 이 수 이상의 점군이 필요하다. */
export const MIN_POINT_COUNT = 20_000;

/** 스캔 부피를 물량 산정에 쓸 수 있는지 판정한다. 사유를 함께 반환한다. */
export function assessScanUsability(
  quality: Scan3DQuality,
  scaleSource: ScanScaleSource,
): { usable: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (scaleSource === 'NONE') {
    reasons.push('실제 치수 기준이 없어 부피를 계산할 수 없습니다.');
  }
  if (quality.registeredRatio < MIN_REGISTERED_RATIO) {
    reasons.push(
      `사진의 ${Math.round(quality.registeredRatio * 100)}%만 정렬됐습니다. 겹치도록 천천히 한 바퀴 다시 촬영해 주세요.`,
    );
  }
  if (quality.pointCount < MIN_POINT_COUNT) {
    reasons.push('복원된 형상이 너무 성깁니다(무늬 없는 벽면·반사면이 많을 때 생깁니다).');
  }
  if (!quality.watertight) {
    reasons.push('외형에 뚫린 곳이 있어 부피가 실제보다 작게 나올 수 있습니다.');
  }
  return { usable: reasons.length === 0, reasons };
}

/** 스캔으로 얻은 실측값. */
export interface ScanVolumeInput {
  /** 복원된 외피 부피(㎥). */
  grossVolumeM3: number;
  structure?: BuildingStructure;
  scaleSource: ScanScaleSource;
  quality: Scan3DQuality;
}

export interface ScanVolumeEstimate {
  estimatedTons: number;
  rangeMinTons: number;
  rangeMaxTons: number;
  grossVolumeM3: number;
  /** 부피 원단위(t/㎥) — 어떤 값으로 환산했는지 드러낸다. */
  tonPerM3: number;
  scaleSource: ScanScaleSource;
  /** 스캔 부피를 실제로 썼는지. false 면 호출부가 연면적 원단위로 폴백해야 한다. */
  usable: boolean;
  /** 못 쓴 이유(사용자 노출 가능). */
  reasons: string[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * 실측 외피 부피 → 예상 폐기물 총량(톤).
 *
 * 품질·스케일 게이트를 통과하지 못하면 `usable:false` 로 반환한다 —
 * 나쁜 스캔의 부피는 원단위 추정보다 나쁘므로, 그대로 쓰느니 폴백하는 편이 정확하다.
 */
export function estimateTonsFromScan(input: ScanVolumeInput): ScanVolumeEstimate {
  const structure = input.structure ?? 'RC';
  const tonPerM3 = WASTE_TON_PER_GROSS_M3[structure];
  const { usable, reasons } = assessScanUsability(input.quality, input.scaleSource);

  if (!Number.isFinite(input.grossVolumeM3) || input.grossVolumeM3 <= 0) {
    return {
      estimatedTons: 0,
      rangeMinTons: 0,
      rangeMaxTons: 0,
      grossVolumeM3: 0,
      tonPerM3,
      scaleSource: input.scaleSource,
      usable: false,
      reasons: [...reasons, '복원된 부피가 없습니다.'],
    };
  }

  const estimatedTons = round1(input.grossVolumeM3 * tonPerM3);
  // 오차폭은 스케일 출처가 정한다. 실측이라도 스케일이 대장 역산이면 넓게 잡는다.
  const ratio = Math.min(
    ESTIMATE_RANGE_RATIO,
    SCALE_SOURCE_ERROR_RATIO[input.scaleSource] ?? ESTIMATE_RANGE_RATIO,
  );

  return {
    estimatedTons,
    rangeMinTons: round1(estimatedTons * (1 - ratio)),
    rangeMaxTons: round1(estimatedTons * (1 + ratio)),
    grossVolumeM3: round1(input.grossVolumeM3),
    tonPerM3: Math.round(tonPerM3 * 1000) / 1000,
    scaleSource: input.scaleSource,
    usable,
    reasons,
  };
}

/**
 * 건축물대장 연면적으로 스캔의 스케일을 역산한다(폴백 경로).
 *
 * 복원은 기본적으로 크기를 모르고 **비율만** 안다. AR 포즈가 없을 때, 복원된 바닥면적과
 * 대장 연면적의 비로 배율을 구한다. 길이 배율이므로 면적비의 제곱근이다.
 * 대장 자체가 틀리면 같이 틀리므로 신뢰도는 한 단계 낮게 다룬다.
 */
export function scaleFactorFromLedgerArea(
  reconstructedFloorAreaUnits: number,
  ledgerTotalFloorAreaM2: number,
): number | undefined {
  if (
    !Number.isFinite(reconstructedFloorAreaUnits) ||
    reconstructedFloorAreaUnits <= 0 ||
    !Number.isFinite(ledgerTotalFloorAreaM2) ||
    ledgerTotalFloorAreaM2 <= 0
  ) {
    return undefined;
  }
  return Math.sqrt(ledgerTotalFloorAreaM2 / reconstructedFloorAreaUnits);
}

/**
 * 스캔 부피가 알려주는 **평균 층고**(m). 연면적 원단위가 못 보는 값이라,
 * 사용자에게 "왜 추정이 달라졌는지" 설명하는 근거가 된다.
 */
export function impliedStoreyHeightM(
  grossVolumeM3: number,
  totalFloorAreaM2: number,
): number | undefined {
  if (grossVolumeM3 <= 0 || totalFloorAreaM2 <= 0) return undefined;
  return Math.round((grossVolumeM3 / totalFloorAreaM2) * 100) / 100;
}
