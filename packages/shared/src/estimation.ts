/**
 * AI 물량 산정 (로드맵 Phase 6 · 고도화).
 * 현장 정보(연면적/구조/사진)로 철거 폐기물 발생량(톤)을 추정한다.
 * 실제 AI(사진 분석) 연동 전까지는 원단위 휴리스틱 목이 동작한다 — 항상 참고용.
 */

/** 건물 구조 (철거 폐기물 발생 원단위 보정용). */
export type BuildingStructure = 'RC' | 'BRICK' | 'WOOD';

export const BUILDING_STRUCTURE_LABELS: Record<BuildingStructure, string> = {
  RC: '철근콘크리트',
  BRICK: '조적(벽돌)',
  WOOD: '목조',
};

/**
 * 연면적 1㎡당 철거 폐기물 발생 원단위(톤/㎡) 초기값.
 * 파일럿 실측 데이터로 보정한다 — 이 파일에서만 수정 (하드코딩 금지).
 */
export const DEMOLITION_TON_PER_M2 = 1.2;

/** 구조별 보정 계수. */
export const STRUCTURE_FACTORS: Record<BuildingStructure, number> = {
  RC: 1.3,
  BRICK: 1.0,
  WOOD: 0.6,
};

export type EstimateConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface VolumeEstimate {
  /** 추정 폐기물량(톤, 소수 1자리). */
  estimatedTons: number;
  confidence: EstimateConfidence;
  /** 추정 방법 식별자 (AREA_HEURISTIC: 원단위, AI_VISION: 사진 분석 — 연동 후). */
  method: 'AREA_HEURISTIC' | 'AI_VISION';
  /** UI 필수 노출 문구 — 추정치의 한계 고지. */
  disclaimer: string;
  estimatedAt: string;
}
