import {
  ASBESTOS_BAN_YEAR,
  approvalYear,
  asbestosRisk,
  structureCodeOf,
  type BuildingLedgerInfo,
  type BuildingStructure,
  type DetectedMaterial,
  type MaterialCategory,
  type SiteAnalysis,
} from '@dimol/shared';

/**
 * 건축물대장 정합성 후처리 — 프롬프트로 "부탁"하던 것을 규칙으로 "강제"한다.
 *
 * `buildingFactsForVision` 이 대장 사실을 프롬프트에 실어주지만, 모델은 그 지시를
 * 무시할 수 있다. 대장은 사진 판독보다 신뢰도가 높은 확정 정보이므로, 응답을 받은 뒤
 * 한 번 더 결정론적으로 맞춘다.
 *
 * ⚠️ 안전 원칙: 위험(석면) 경고는 **추가·강등만 하고 삭제하지 않는다**. 대장상 근거가
 * 약하면 신뢰도를 낮추고 "확인 필요" 로 표기할 뿐, 경고 자체를 지우지 않는다.
 * 잘못 지운 석면 경고는 사람이 다칠 수 있는 오류다.
 */

/** 대장 주구조 → 그 구조에서 반드시 나오는 소재 분류. */
const STRUCTURAL_MATERIAL: Record<BuildingStructure, MaterialCategory> = {
  RC: 'CONCRETE',
  BRICK: 'BRICK',
  WOOD: 'WOOD',
};

const STRUCTURAL_MATERIAL_NAME: Record<BuildingStructure, string> = {
  RC: '철근콘크리트 구조체(대장 근거)',
  BRICK: '벽돌·조적 구조체(대장 근거)',
  WOOD: '목재 구조체(대장 근거)',
};

/** 석면 의심으로 다루는 소재 분류. */
const ASBESTOS_RELATED: readonly MaterialCategory[] = ['ROOFING', 'HAZARD'];

/** 대장상 석면 위험이 높은데 모델이 언급하지 않았을 때 덧붙이는 경고. */
export const LEDGER_ASBESTOS_HAZARD =
  '건축물대장상 석면 함유 자재 사용 가능 시기의 건물입니다 — 석면 사전조사 의무 대상인지 반드시 확인하세요.';

export interface ConsistencyResult {
  analysis: SiteAnalysis;
  /** 어떤 규칙이 적용됐는지(로그·디버깅용, 사용자 노출 아님). */
  applied: string[];
}

/**
 * 사진 분석 결과를 건축물대장 사실과 맞춘다.
 * 대장 정보가 없으면 아무것도 하지 않는다(원본 그대로 반환).
 */
export function applyLedgerConsistency(
  analysis: SiteAnalysis,
  building: BuildingLedgerInfo | null | undefined,
): ConsistencyResult {
  const applied: string[] = [];
  const structure = structureCodeOf(building);
  const risk = asbestosRisk(building);
  const year = approvalYear(building?.useAprDay);

  if (!structure && risk === 'UNKNOWN') return { analysis, applied };

  let materials: DetectedMaterial[] = analysis.materials.map((m) => ({ ...m }));
  const hazards = [...analysis.hazards];
  const coverage = [...analysis.coverageWarnings];

  // ① 석면 근거 강등 — 대장상 금지 연도 이후 건물인데 슬레이트·석면류를 인식한 경우.
  //    지우지는 않는다. 신뢰도만 낮추고 확인이 필요하다는 사실을 명시한다.
  if (risk === 'LOW' && year) {
    materials = materials.map((m) => {
      if (!m.hazardous && !ASBESTOS_RELATED.includes(m.category)) return m;
      applied.push(`asbestos-downgrade:${m.category}`);
      return {
        ...m,
        confidence: 'LOW',
        basis: m.basis === 'LEDGER' ? 'LEDGER' : 'PHOTO_LEDGER',
        note: appendNote(
          m.note,
          `건축물대장 사용승인 ${year}년(석면 자재 사용 금지 ${ASBESTOS_BAN_YEAR}년 이후) — 사진 근거만으로는 확정할 수 없습니다. 현장 확인 필요.`,
        ),
      };
    });
  }

  // ② 석면 경고 보강 — 대장상 위험한데 모델이 아무 말도 하지 않은 경우(안전 방향으로만).
  if (risk === 'HIGH' || risk === 'POSSIBLE') {
    const mentioned =
      materials.some((m) => m.hazardous) || hazards.some((h) => h.includes('석면'));
    if (!mentioned) {
      hazards.unshift(LEDGER_ASBESTOS_HAZARD);
      applied.push('asbestos-add-from-ledger');
    }
  }

  // ③ 주구조 보완 — 대장상 주구조 소재가 결과에 없으면 추가한다.
  //    사진에 골조가 안 보였을 뿐 반출 물량의 대부분을 차지하는 소재다.
  if (structure) {
    const required = STRUCTURAL_MATERIAL[structure];
    if (!materials.some((m) => m.category === required)) {
      materials.push({
        category: required,
        name: STRUCTURAL_MATERIAL_NAME[structure],
        confidence: 'MEDIUM',
        recyclable: true,
        hazardous: false,
        basis: 'LEDGER',
        note: '사진에서 확인되지 않았으나 건축물대장 주구조상 반드시 발생합니다.',
      });
      applied.push(`structure-add:${required}`);
    }
  }

  // ④ 주구조 모순 — 대장 구조와 다른 소재가 최대 비중으로 나온 경우.
  //    비중을 뒤집지는 않고(수치 조작 금지), 구조체가 아니라 마감재일 수 있다고 표기한다.
  if (structure) {
    const required = STRUCTURAL_MATERIAL[structure];
    const top = topByRatio(materials);
    if (top && top.category !== required && (top.estimatedRatio ?? 0) > 0) {
      applied.push(`structure-conflict:${top.category}`);
      coverage.push(
        `사진에서는 ${top.name}이(가) 가장 두드러지지만, 건축물대장상 주구조는 ${STRUCTURAL_MATERIAL_NAME[structure]}입니다. 해당 소재는 구조체가 아닌 마감재일 수 있습니다.`,
      );
    }
  }

  return {
    analysis: { ...analysis, materials, hazards, coverageWarnings: coverage },
    applied,
  };
}

function appendNote(note: string | undefined, extra: string): string {
  return note ? `${note} ${extra}` : extra;
}

function topByRatio(materials: readonly DetectedMaterial[]): DetectedMaterial | undefined {
  let top: DetectedMaterial | undefined;
  for (const m of materials) {
    if ((m.estimatedRatio ?? 0) > (top?.estimatedRatio ?? 0)) top = m;
  }
  return top;
}
