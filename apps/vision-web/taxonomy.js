/*
 * 자재 분류 v1 라벨 + 위험/단계 라벨 (렌더링용).
 * 단일 원천은 packages/shared 의 vision-taxonomy.ts / vision-report.ts 다. 여기는 표시 미러.
 */
window.DimolVision = window.DimolVision || {};
window.DimolVision.taxonomy = {
  materialLabels: {
    REINFORCED_CONCRETE: "철근콘크리트",
    PLAIN_CONCRETE: "무근콘크리트",
    BRICK_MASONRY: "벽돌/조적",
    WOOD: "목재(구조·창호)",
    METAL: "금속(철골/샤시/배관)",
    GLASS: "유리",
    GYPSUM_BOARD: "석고보드",
    ROOFING_SLATE: "지붕재(슬레이트)",
    WATERPROOF_INSULATION: "방수/단열재",
    WASTE_SYNTHETIC_RESIN: "폐합성수지(장판·창틀 등)",
    SANITARY_TILE: "위생도기/타일",
    MIXED_WASTE: "혼합폐기물",
  },
  hazardLabels: {
    ASBESTOS_SUSPECT: "석면 의심",
    STRUCTURAL_INSTABILITY: "구조 불안정",
    ELECTRICAL_GAS: "전기/가스 배관",
    OBSTRUCTION: "지장물",
  },
  structureLabels: {
    RC: "철근콘크리트조",
    MASONRY: "조적조",
    WOOD: "목구조",
    STEEL: "철골조",
    UNKNOWN: "구조 미상",
  },
  // 진행 단계 라벨(기획서 §3.2 순서).
  stageOrder: ["recognition", "guideline_search", "process_generation"],
  stageLabels: {
    recognition: "자재 인식",
    guideline_search: "안전지침 검색",
    process_generation: "공정표 생성",
  },
};
