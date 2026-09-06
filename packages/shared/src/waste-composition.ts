/**
 * 철거 폐기물 성상별 구성비 — "얼마나 나오는가"를 사진이 아니라 계산으로 푸는 단일 원천.
 *
 * 배경: 사진 눈대중 중량(VLM 에게 kg 을 묻는 것)은 비전 모델이 가장 못하는 일이라
 * 값이 통째로 환각이 된다. 그래서 역할을 나눈다.
 *   - 총량(얼마인가)  : 건축물대장 연면적 × 원단위 × 구조계수  → `estimation.ts`
 *   - 구성비(무엇이 얼마나 차지하나) : 구조별 성상 구성비 표    → 이 파일
 *   - 사진(무엇이 있나) : 자재 존재 확인 + 구성비 미세 보정      → SiteAnalyzer
 *
 * 사진은 표에 없는 자재(슬레이트 지붕·유리 등)를 "발견"하고 비율을 흔드는 역할만 하고,
 * 물리적으로 말이 되는 총량·비율은 표가 보장한다.
 *
 * ⚠️ 아래 구성비는 환경부 건설폐기물 발생원단위·성상 통계에 기반한 **초기값**이다.
 * 올바로 전자인계서의 실제 처리 실적 톤수와 대사해 보정한다(예측 톤 ↔ 실적 톤 회귀).
 * 보정 시 이 파일의 상수만 고치고, 호출부에 숫자를 하드코딩하지 않는다.
 */

import type { BuildingStructure } from './estimation.js';
import type { WasteItem } from './request.js';
import { isVisionMaterialCode, type VisionMaterialCode } from './vision-taxonomy.js';

/** 구조별 성상 구성비(합계 1.0). 값은 전체 발생 중량 대비 비율이다. */
export const MATERIAL_COMPOSITION_BY_STRUCTURE: Record<
  BuildingStructure,
  Partial<Record<VisionMaterialCode, number>>
> = {
  // 철근콘크리트조 — 폐콘크리트가 압도적이고 철근이 뒤를 잇는다.
  RC: {
    REINFORCED_CONCRETE: 0.84,
    METAL: 0.05,
    BRICK_MASONRY: 0.03,
    WOOD: 0.02,
    GYPSUM_BOARD: 0.01,
    SANITARY_TILE: 0.01,
    WASTE_SYNTHETIC_RESIN: 0.01,
    MIXED_WASTE: 0.03,
  },
  // 조적조 — 벽돌·블록이 주성분, 기초·바닥 슬래브에서 무근콘크리트가 나온다.
  BRICK: {
    BRICK_MASONRY: 0.48,
    PLAIN_CONCRETE: 0.26,
    WOOD: 0.06,
    METAL: 0.04,
    SANITARY_TILE: 0.03,
    GYPSUM_BOARD: 0.02,
    WASTE_SYNTHETIC_RESIN: 0.02,
    MIXED_WASTE: 0.09,
  },
  // 목조 — 목재 비중이 크지만 기초 콘크리트가 중량으로는 만만치 않다.
  WOOD: {
    WOOD: 0.38,
    PLAIN_CONCRETE: 0.3,
    BRICK_MASONRY: 0.08,
    METAL: 0.05,
    GYPSUM_BOARD: 0.04,
    WASTE_SYNTHETIC_RESIN: 0.04,
    SANITARY_TILE: 0.02,
    MIXED_WASTE: 0.09,
  },
};

/** 구조를 알 수 없을 때 쓰는 기본 구조(국내 철거 현장 최빈값). */
export const DEFAULT_COMPOSITION_STRUCTURE: BuildingStructure = 'RC';

/**
 * 구조 표에는 없지만 사진에서 확인된 자재의 기본 구성비.
 * 슬레이트 지붕·유리·단열재처럼 "있으면 반드시 분리 배출해야 하지만 중량 비중은 작은" 것들.
 */
export const DETECTED_EXTRA_RATIO = 0.02;

/**
 * 모델이 준 구성비 힌트의 허용 배율. 표 대비 [1/N, N] 배로 제한한다.
 * 사진은 비율을 흔들 수는 있어도 물리를 뒤집지는 못하게 한다(예: RC 조에서 유리 60% 같은 출력 차단).
 */
export const COMPOSITION_HINT_CLAMP = 2;

/** 항목 최소 중량(kg). 반올림으로 0kg 항목이 생기지 않게 한다. */
export const MIN_ITEM_KG = 1;

export interface CompositionInput {
  /** 건축물대장에서 판정한 구조. 없으면 `DEFAULT_COMPOSITION_STRUCTURE`. */
  structure?: BuildingStructure;
  /** 사진에서 실제로 확인된 자재 코드. 표에 없는 코드는 항목으로 추가된다. */
  detected?: readonly VisionMaterialCode[];
  /**
   * 사진에서 얻은 구성비 힌트(코드 → 비율 0~1). 표 값 대비 `COMPOSITION_HINT_CLAMP`
   * 배율 안으로 클램프한 뒤 반영한다. 표에 없는 코드는 클램프 없이 그대로 쓴다.
   */
  hints?: Partial<Record<VisionMaterialCode, number>>;
}

/** 합이 1이 되도록 정규화. 합이 0이면 빈 객체. */
function normalize(
  weights: Partial<Record<VisionMaterialCode, number>>,
): Partial<Record<VisionMaterialCode, number>> {
  const entries = Object.entries(weights) as [VisionMaterialCode, number][];
  const sum = entries.reduce((acc, [, v]) => acc + (v > 0 ? v : 0), 0);
  if (sum <= 0) return {};
  const out: Partial<Record<VisionMaterialCode, number>> = {};
  for (const [code, v] of entries) {
    if (v > 0) out[code] = v / sum;
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 구조 표 + 사진 관찰을 합쳐 최종 구성비(합=1)를 만든다.
 *
 * - 표에 있는 자재는 **사진에 안 보여도 유지한다**. 기초 콘크리트·지하 구조물처럼
 *   사진에 담기지 않을 뿐 실제로는 반출되는 물량이 빠지는 것을 막기 위해서다.
 * - 사진에서만 확인된 자재는 `DETECTED_EXTRA_RATIO` 로 편입한다.
 * - 힌트가 있으면 표 값 대비 클램프 범위 안에서 비율을 조정한다.
 */
export function resolveComposition(
  input: CompositionInput = {},
): Partial<Record<VisionMaterialCode, number>> {
  const structure = input.structure ?? DEFAULT_COMPOSITION_STRUCTURE;
  const base = MATERIAL_COMPOSITION_BY_STRUCTURE[structure] ?? {};
  const hints = input.hints ?? {};
  const weights: Partial<Record<VisionMaterialCode, number>> = {};

  // ① 구조 표의 자재 — 힌트가 있으면 클램프 범위 안에서 조정.
  for (const [code, ratio] of Object.entries(base) as [VisionMaterialCode, number][]) {
    const hint = hints[code];
    weights[code] =
      typeof hint === 'number' && hint > 0
        ? clamp(hint, ratio / COMPOSITION_HINT_CLAMP, ratio * COMPOSITION_HINT_CLAMP)
        : ratio;
  }

  // ② 사진에서만 확인된 자재 — 표에 없으므로 관찰 근거로 편입.
  //    힌트도 기본 비율 대비 클램프한다. 그러지 않으면 "RC 조 현장 폐기물의 60%가 유리"
  //    같은 모델 출력이 그대로 통과한다(마감재는 눈에 잘 띄어 과대평가되기 쉽다).
  for (const code of input.detected ?? []) {
    if (!isVisionMaterialCode(code) || weights[code] !== undefined) continue;
    const hint = hints[code];
    weights[code] =
      typeof hint === 'number' && hint > 0
        ? clamp(
            hint,
            DETECTED_EXTRA_RATIO / COMPOSITION_HINT_CLAMP,
            DETECTED_EXTRA_RATIO * COMPOSITION_HINT_CLAMP,
          )
        : DETECTED_EXTRA_RATIO;
  }

  return normalize(weights);
}

/**
 * 총 중량(kg)을 구성비대로 나눠 소재별 항목으로 만든다.
 * 반올림 오차는 가장 큰 항목에 몰아 합계가 `totalKg` 와 정확히 일치하게 맞춘다.
 */
export function distributeByComposition(totalKg: number, input: CompositionInput = {}): WasteItem[] {
  if (!Number.isFinite(totalKg) || totalKg <= 0) return [];
  const ratios = Object.entries(resolveComposition(input)) as [VisionMaterialCode, number][];
  if (ratios.length === 0) return [];

  // 비중이 큰 순으로 표기한다(리포트 가독성 + 반올림 보정 대상 특정).
  ratios.sort((a, b) => b[1] - a[1]);

  // 반올림해서 0kg 이 되는 미세 항목은 버린다. 1kg 바닥을 깔면 항목 수만큼
  // 합계가 총량을 넘어서 "항목 합계 = 총량" 불변식이 깨진다.
  const items: WasteItem[] = ratios
    .map(([material, ratio]) => ({ material, kg: Math.round(totalKg * ratio) }))
    .filter((i) => i.kg >= MIN_ITEM_KG);

  if (items.length === 0) {
    const [material] = ratios[0]!;
    return [{ material, kg: Math.max(MIN_ITEM_KG, Math.round(totalKg)) }];
  }

  const largest = items[0];
  const diff = Math.round(totalKg) - items.reduce((sum, i) => sum + i.kg, 0);
  if (diff !== 0 && largest) {
    largest.kg = Math.max(MIN_ITEM_KG, largest.kg + diff);
  }
  return items;
}
