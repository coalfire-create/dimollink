"""디몰비전 자재 분류 체계 v1 + 고정 문구 (기획서 §2.3, §7.1).

⚠️ 단일 원천은 `packages/shared/src/vision-taxonomy.ts` / `vision-report.ts` 이다.
이 파일은 AI 서버(Python) 측 미러이며, shared TS 계약과 항상 동기화되어야 한다.
(V1 이후 codegen 으로 자동 동기화하는 것을 목표로 하되, 현재는 수기 미러.)
"""

from __future__ import annotations

from typing import Dict, List

# 자재 분류 체계 v1 (12종). code -> (한국어 라벨, 석면 의심 연동 여부)
MATERIAL_TAXONOMY_V1: Dict[str, Dict[str, object]] = {
    "REINFORCED_CONCRETE": {"label": "철근콘크리트", "asbestos_suspect": False},
    "PLAIN_CONCRETE": {"label": "무근콘크리트", "asbestos_suspect": False},
    "BRICK_MASONRY": {"label": "벽돌/조적", "asbestos_suspect": False},
    "WOOD": {"label": "목재(구조·창호)", "asbestos_suspect": False},
    "METAL": {"label": "금속(철골/샤시/배관)", "asbestos_suspect": False},
    "GLASS": {"label": "유리", "asbestos_suspect": False},
    "GYPSUM_BOARD": {"label": "석고보드", "asbestos_suspect": False},
    "ROOFING_SLATE": {"label": "지붕재(슬레이트)", "asbestos_suspect": True},
    "WATERPROOF_INSULATION": {"label": "방수/단열재", "asbestos_suspect": False},
    "WASTE_SYNTHETIC_RESIN": {"label": "폐합성수지(장판·창틀 등)", "asbestos_suspect": False},
    "SANITARY_TILE": {"label": "위생도기/타일", "asbestos_suspect": False},
    "MIXED_WASTE": {"label": "혼합폐기물", "asbestos_suspect": False},
}

MATERIAL_CODES: List[str] = list(MATERIAL_TAXONOMY_V1.keys())

ASBESTOS_SUSPECT_CODES = frozenset(
    code for code, d in MATERIAL_TAXONOMY_V1.items() if d["asbestos_suspect"]
)

# 위험 요소 유형(hazards[].type) — shared VisionHazardType 와 동일.
HAZARD_TYPES = frozenset(
    {"ASBESTOS_SUSPECT", "STRUCTURAL_INSTABILITY", "ELECTRICAL_GAS", "OBSTRUCTION"}
)

# 올바로 전자인계서 의무신고 기준: 건설폐기물 5톤 이상 (packages/shared constants 미러).
ALLBARO_MANDATORY_CONSTRUCTION_WASTE_TON = 5

# 법적 고지 고정 문구 (기획서 §7.1 · 항상 포함, 임의 변경 금지).
REPORT_DISCLAIMER = "본 자료는 참고용 분석이며, 관계 법령에 따른 해체계획서 및 전문가 검토를 대체하지 않습니다."

# 석면 의심 항목 안내 고정 문구 (기획서 §7.1).
ASBESTOS_SUSPECT_GUIDANCE = "석면안전관리법에 따른 전문 조사기관 조사 필요"


def is_material_code(value: str) -> bool:
    return value in MATERIAL_TAXONOMY_V1


def is_asbestos_suspect_material(code: str) -> bool:
    return code in ASBESTOS_SUSPECT_CODES


def is_allbaro_manifest_required(estimated_waste_ton: float) -> bool:
    return estimated_waste_ton >= ALLBARO_MANDATORY_CONSTRUCTION_WASTE_TON
