/**
 * 현장 사진 AI 분석 (로드맵 Phase 6 · AI 고도화).
 * 철거 현장 사진 → ①구성 소재 식별 ②철거 공정(순서·주의) 안내 ③위험 요소 경고.
 * 실제 비전 AI(Claude) 연동 전/키 미설정 시에는 목(mock)이 동작한다 — 항상 참고용.
 *
 * ⚠️ 안전: 철거는 구조 안전·석면 등 위험을 수반한다. 이 결과는 참고용이며
 * 실제 작업은 전문가 현장 실사·구조안전진단·석면조사·관계 법령을 따라야 한다.
 */

import type { BuildingStructure } from './estimation.js';
import type { WasteItem } from './request.js';
import type { VisionMaterialCode } from './vision-taxonomy.js';
import { distributeByComposition } from './waste-composition.js';

export type AnalysisConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

/** 식별 소재 분류. HAZARD 는 석면·중금속 등 위험/특별관리 대상. */
export type MaterialCategory =
  | 'CONCRETE'
  | 'STEEL'
  | 'BRICK'
  | 'WOOD'
  | 'GLASS'
  | 'GYPSUM'
  | 'INSULATION'
  | 'ROOFING'
  | 'TILE'
  | 'HAZARD'
  | 'OTHER';

export const MATERIAL_CATEGORY_LABELS: Record<MaterialCategory, string> = {
  CONCRETE: '콘크리트',
  STEEL: '철골·철근',
  BRICK: '벽돌·조적',
  WOOD: '목재',
  GLASS: '유리',
  GYPSUM: '석고보드',
  INSULATION: '단열재',
  ROOFING: '지붕재',
  TILE: '위생도기·타일',
  HAZARD: '위험·특별관리',
  OTHER: '기타',
};

export interface DetectedMaterial {
  category: MaterialCategory;
  /** 사람이 읽는 소재명 (예: '철근콘크리트 벽체'). */
  name: string;
  /**
   * 신뢰도. 사진이 여러 장이면 **모델 자가보고가 아니라 사진 간 합의**로 정한다
   * (`detectedIn / photoCount` → [[confidenceFromDetectionRate]]).
   * 모델이 스스로 매긴 confidence 는 근거 없이 높게 나오는 경향이 있어 그대로 믿지 않는다.
   */
  confidence: AnalysisConfidence;
  /** 재활용(분리배출) 가능 추정. */
  recyclable: boolean;
  /** 위험/특별관리 대상 여부(석면 의심 등). true 면 UI 강조. */
  hazardous: boolean;
  /** 처리·분리 관련 참고 메모(선택). */
  note?: string;
  /**
   * 사진에서 본 이 소재의 대략적인 구성비 힌트(%, 0~100, 선택).
   *
   * 예전에는 모델에게 소재별 kg 을 직접 물었으나, 사진 눈대중 중량은 비전 모델이
   * 가장 못하는 일이라 값이 통째로 환각이었다. 지금은 "얼마인가"는 연면적 원단위가
   * 계산하고([[estimation]]), 모델은 "무엇이 얼마나 차지해 보이나"만 답한다.
   * 이 힌트는 구조별 구성비 표 대비 제한된 배율 안에서만 반영된다([[waste-composition]]).
   */
  estimatedRatio?: number;
  /** 이 소재가 검출된 사진 수(사진별 독립 추론 시). */
  detectedIn?: number;
  /** 교차검증에 쓰인 전체 사진 수. */
  photoCount?: number;
  /**
   * 판정 근거 표시 — 사진이 아니라 건축물대장·구조 규칙으로 보정·추가된 항목인지.
   * 사용자에게 "사진에서 확인" 과 "대장 근거로 보완" 을 구분해 보여주기 위한 값이다.
   */
  basis?: 'PHOTO' | 'LEDGER' | 'PHOTO_LEDGER';
}

/**
 * 사진 간 검출률(0~1) → 신뢰도 등급.
 * 여러 장 중 몇 장에서 같은 소재가 보였는지가 모델 자가보고보다 훨씬 정직한 신호다.
 */
export function confidenceFromDetectionRate(rate: number): AnalysisConfidence {
  if (rate >= 0.67) return 'HIGH';
  if (rate >= 0.34) return 'MEDIUM';
  return 'LOW';
}

export interface DemolitionStep {
  /** 1부터 시작하는 공정 순서. */
  order: number;
  title: string;
  description: string;
  /** 안전/주의 사항(선택). */
  caution?: string;
}

export interface SiteAnalysis {
  /** 한 줄 요약(현장 개요). */
  summary: string;
  materials: DetectedMaterial[];
  /** 권장 철거 공정 순서. */
  demolitionSteps: DemolitionStep[];
  /** 위험 요소 경고(석면·붕괴·전기 등). 비어 있을 수 있음. */
  hazards: string[];
  /**
   * 촬영 범위의 한계로 **판정하지 못한 것**을 명시한다(결측 선언).
   *
   * 근거 없이 추정하는 것보다 "이건 판정 불가"라고 말하는 편이 정확하다.
   * 예: '지붕 사진이 없어 지붕재(석면 의심 자재 포함)를 판정하지 못했습니다.'
   */
  coverageWarnings: string[];
  /** 분석 방법: MOCK(목) | AI_VISION(실제 비전 분석). */
  method: 'MOCK' | 'AI_VISION';
  confidence: AnalysisConfidence;
  /** UI 필수 노출 문구 — 참고용/안전 한계 고지. */
  disclaimer: string;
  analyzedAt: string;
}

/** UI·응답에 반드시 함께 노출하는 안전 고지. */
export const SITE_ANALYSIS_DISCLAIMER =
  '사진 기반 참고용 분석입니다. 실제 철거는 구조안전진단·석면조사 등 전문가 현장 실사와 관계 법령을 반드시 따르세요. 위험 소재(석면 등)는 임의로 제거하지 마세요.';

/**
 * 사진 분석 소재(MaterialCategory 10종) → 디몰비전 자재 분류(VisionMaterialCode 12종) 매핑.
 * 사진 기반 자동 채움에서 요청서의 wasteItems 소재 코드로 변환하는 단일 원천이다.
 */
export const SITE_ANALYSIS_TO_VISION_MATERIAL: Record<MaterialCategory, VisionMaterialCode> = {
  CONCRETE: 'REINFORCED_CONCRETE',
  STEEL: 'METAL',
  BRICK: 'BRICK_MASONRY',
  WOOD: 'WOOD',
  GLASS: 'GLASS',
  GYPSUM: 'GYPSUM_BOARD',
  INSULATION: 'WATERPROOF_INSULATION',
  ROOFING: 'ROOFING_SLATE',
  TILE: 'SANITARY_TILE',
  HAZARD: 'MIXED_WASTE',
  OTHER: 'MIXED_WASTE',
};

/**
 * 총 중량을 알 수 없을 때(연면적 미상) 소재별로 채우는 자리표시 중량(kg).
 * 총량이 없으면 구성비를 곱할 대상이 없어 물리적 산정이 불가능하다. 이때는
 * 숫자를 지어내는 대신 눈에 띄는 자리표시값을 넣고 사용자가 채우도록 유도한다.
 */
export const DEFAULT_PHOTO_MATERIAL_KG = 500;

/**
 * 사진 분석 결과 → 요청서 소재별 항목(wasteItems)으로 변환.
 *
 * totalKg(연면적 × 원단위 × 구조계수)가 있으면 **구조별 성상 구성비**로 나눈다
 * ([[waste-composition]]). 예전 구현은 소재 종류 수로 균등 분배해서 폐콘크리트와
 * 유리가 같은 톤수로 나오는 문제가 있었다.
 *
 * 사진에서 확인된 소재는 구성비 표에 없더라도 항목으로 편입되고(슬레이트 지붕 등),
 * 반대로 사진에 안 보여도 구조상 반드시 나오는 소재(기초 콘크리트 등)는 표가 지켜준다.
 *
 * @param structure 건축물대장 판정 구조. 없으면 표의 기본 구조를 쓴다.
 */
export function siteAnalysisToWasteItems(
  materials: readonly DetectedMaterial[],
  totalKg?: number,
  structure?: BuildingStructure,
): WasteItem[] {
  const detected: VisionMaterialCode[] = [];
  const hints: Partial<Record<VisionMaterialCode, number>> = {};
  for (const m of materials) {
    const code = SITE_ANALYSIS_TO_VISION_MATERIAL[m.category];
    if (!code) continue;
    if (!detected.includes(code)) detected.push(code);
    // 같은 코드로 매핑되는 소재가 여러 건이면 비율 힌트는 합산한다(%→비율).
    if (typeof m.estimatedRatio === 'number' && m.estimatedRatio > 0) {
      hints[code] = (hints[code] ?? 0) + m.estimatedRatio / 100;
    }
  }

  if (detected.length === 0) return [];

  if (typeof totalKg === 'number' && totalKg > 0) {
    return distributeByComposition(totalKg, { structure, detected, hints });
  }

  // 총량 미상 — 구성비를 곱할 대상이 없다. 사용자가 채울 자리표시값만 준다.
  return detected.map((material) => ({ material, kg: DEFAULT_PHOTO_MATERIAL_KG }));
}
