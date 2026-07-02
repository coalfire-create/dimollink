import {
  DEMOLITION_TON_PER_M2,
  STRUCTURE_FACTORS,
  type BuildingStructure,
  type VolumeEstimate,
} from '@dimol/shared';

/**
 * AI 물량 산정 어댑터 (로드맵 Phase 6).
 * 실제 AI(현장 사진 비전 분석) 계약/연동 전이므로 원단위 휴리스틱 목으로 시작한다.
 * 연동 시 이 인터페이스 구현체만 교체한다 (사진 키를 입력으로 받는 이유).
 */

export class EstimationValidationError extends Error {}

export interface EstimateVolumeInput {
  /** 연면적(㎡). 휴리스틱 목에서는 필수. */
  floorAreaM2?: number;
  structure?: BuildingStructure;
  /** 현장 사진 키 — AI 비전 연동 시 사용. 목에서는 무시된다. */
  sitePhotoKeys?: string[];
}

export interface VolumeEstimator {
  estimate(input: EstimateVolumeInput): Promise<VolumeEstimate>;
}

const DISCLAIMER =
  '원단위 기반 참고 추정치입니다. 실제 물량은 현장 실사로 확정하며, 견적·계약의 근거로 단독 사용하지 마세요.';

/** 원단위 휴리스틱 목 — 연면적 × 원단위 × 구조 보정. 결정적(같은 입력 → 같은 결과). */
export class HeuristicVolumeEstimator implements VolumeEstimator {
  estimate(input: EstimateVolumeInput): Promise<VolumeEstimate> {
    const { floorAreaM2, structure } = input;
    if (typeof floorAreaM2 !== 'number' || !Number.isFinite(floorAreaM2) || floorAreaM2 <= 0) {
      throw new EstimationValidationError(
        'floorAreaM2(연면적 ㎡, 양수)가 필요합니다. 사진만으로 추정하는 AI 분석은 준비중입니다.',
      );
    }
    if (structure !== undefined && !(structure in STRUCTURE_FACTORS)) {
      throw new EstimationValidationError('structure 는 RC | BRICK | WOOD 여야 합니다.');
    }

    const factor = structure ? STRUCTURE_FACTORS[structure] : 1.0;
    const estimatedTons = Math.round(floorAreaM2 * DEMOLITION_TON_PER_M2 * factor * 10) / 10;

    return Promise.resolve({
      estimatedTons,
      // 구조 정보가 있으면 보정이 들어가 신뢰도 한 단계 위.
      confidence: structure ? 'MEDIUM' : 'LOW',
      method: 'AREA_HEURISTIC',
      disclaimer: DISCLAIMER,
      estimatedAt: new Date().toISOString(),
    });
  }
}
