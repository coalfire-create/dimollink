/**
 * 현장 사진 AI 분석 (로드맵 Phase 6 · AI 고도화).
 * 철거 현장 사진 → ①구성 소재 식별 ②철거 공정(순서·주의) 안내 ③위험 요소 경고.
 * 실제 비전 AI(Claude) 연동 전/키 미설정 시에는 목(mock)이 동작한다 — 항상 참고용.
 *
 * ⚠️ 안전: 철거는 구조 안전·석면 등 위험을 수반한다. 이 결과는 참고용이며
 * 실제 작업은 전문가 현장 실사·구조안전진단·석면조사·관계 법령을 따라야 한다.
 */

import type { WasteItem } from './request.js';
import type { VisionMaterialCode } from './vision-taxonomy.js';

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
  HAZARD: '위험·특별관리',
  OTHER: '기타',
};

export interface DetectedMaterial {
  category: MaterialCategory;
  /** 사람이 읽는 소재명 (예: '철근콘크리트 벽체'). */
  name: string;
  confidence: AnalysisConfidence;
  /** 재활용(분리배출) 가능 추정. */
  recyclable: boolean;
  /** 위험/특별관리 대상 여부(석면 의심 등). true 면 UI 강조. */
  hazardous: boolean;
  /** 처리·분리 관련 참고 메모(선택). */
  note?: string;
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
  HAZARD: 'MIXED_WASTE',
  OTHER: 'MIXED_WASTE',
};

/**
 * 총 중량 정보가 없을 때 소재별로 채우는 기본 참고 중량(kg).
 * 사진만으로는 중량 확정이 어려우므로 사용자가 조정하도록 유도한다(디몰비전 VLM 연동 시 대체).
 */
export const DEFAULT_PHOTO_MATERIAL_KG = 500;

/**
 * 사진 분석 결과 → 요청서 소재별 항목(wasteItems)으로 변환.
 * - 식별 소재를 VisionMaterialCode 로 매핑하고 중복 코드는 합쳐(균등 분배) 항목화한다.
 * - totalKg(예: VolumeEstimator 추정 톤×1000)가 있으면 소재 수로 균등 분배하고,
 *   없으면 소재별 기본 중량으로 채운다. 어느 경우든 참고값 — 사용자가 최종 조정한다.
 */
export function siteAnalysisToWasteItems(
  materials: readonly DetectedMaterial[],
  totalKg?: number,
): WasteItem[] {
  const codes: VisionMaterialCode[] = [];
  for (const m of materials) {
    const code = SITE_ANALYSIS_TO_VISION_MATERIAL[m.category];
    if (!codes.includes(code)) codes.push(code);
  }
  if (codes.length === 0) return [];
  const per =
    typeof totalKg === 'number' && totalKg > 0
      ? Math.max(1, Math.round(totalKg / codes.length))
      : DEFAULT_PHOTO_MATERIAL_KG;
  return codes.map((material) => ({ material, kg: per }));
}
