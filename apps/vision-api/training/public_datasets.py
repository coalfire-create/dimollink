"""공개 데이터셋 클래스 → 디몰비전 자재분류 v1(12종) 매핑 (기획서 §4.1, §4.3).

콜드스타트용 공개 데이터를 우리 taxonomy 로 정규화한다. 외부 AI API 무종속 원칙과 무관하며,
공개 라이선스(CC BY 4.0 등) 이미지·라벨을 자체 학습에 편입하는 단계다.

핵심 주의:
- 석면 의심(ROOFING_SLATE)은 어떤 공개 데이터에도 라벨이 없다(비공개). 자체 수집 필수(§V0/V2).
- 공개 'concrete' 는 철근/무근을 구분하지 않으므로 보수적으로 PLAIN_CONCRETE 로 매핑한다.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from app.taxonomy import MATERIAL_TAXONOMY_V1, is_asbestos_suspect_material

# 데이터셋별 원본 클래스명(소문자) → 우리 코드. 원본에 없는 코드는 여기 등장하지 않는다.
DATASET_CLASS_MAP: Dict[str, Dict[str, str]] = {
    # CODD (Mendeley, CC BY 4.0). 10종. 즉시 다운로드 가능.
    "codd": {
        "bricks": "BRICK_MASONRY",
        "brick": "BRICK_MASONRY",
        "concrete": "PLAIN_CONCRETE",
        "tiles": "SANITARY_TILE",
        "tile": "SANITARY_TILE",
        "wood": "WOOD",
        "pipes": "METAL",
        "pipe": "METAL",
        "plastics": "WASTE_SYNTHETIC_RESIN",
        "plastic": "WASTE_SYNTHETIC_RESIN",
        "general waste": "MIXED_WASTE",
        "general-waste": "MIXED_WASTE",
        "foaming insulation": "WATERPROOF_INSULATION",
        "insulation": "WATERPROOF_INSULATION",
        "stones": "MIXED_WASTE",
        "stone": "MIXED_WASTE",
        "plaster boards": "GYPSUM_BOARD",
        "plasterboard": "GYPSUM_BOARD",
        "plaster-board": "GYPSUM_BOARD",
    },
    # AI Hub '산업 폐기물 이미지' (aihub.or.kr, 활용승인 필요). 콜드스타트 핵심.
    "aihub_industrial": {
        "metal": "METAL",
        "metals": "METAL",
        "금속": "METAL",
        "brick": "BRICK_MASONRY",
        "block": "BRICK_MASONRY",
        "벽돌블록": "BRICK_MASONRY",
        "glass": "GLASS",
        "ceramic": "SANITARY_TILE",
        "유리도자기": "GLASS",
        "wood": "WOOD",
        "폐목재": "WOOD",
        "board": "GYPSUM_BOARD",
        "폐보드": "GYPSUM_BOARD",
        "concrete": "PLAIN_CONCRETE",
        "폐콘크리트": "PLAIN_CONCRETE",
        "resin": "WASTE_SYNTHETIC_RESIN",
        "synthetic resin": "WASTE_SYNTHETIC_RESIN",
        "합성수지": "WASTE_SYNTHETIC_RESIN",
        "fiber": "MIXED_WASTE",
        "폐섬유": "MIXED_WASTE",
        "paper": "MIXED_WASTE",
        "폐지": "MIXED_WASTE",
        "tire": "MIXED_WASTE",
        "타이어": "MIXED_WASTE",
    },
    # Roboflow Universe / 일반 construction-materials 계열(영문 표준 클래스).
    "roboflow_construction": {
        "brick": "BRICK_MASONRY",
        "bricks": "BRICK_MASONRY",
        "concrete": "PLAIN_CONCRETE",
        "concrete block": "PLAIN_CONCRETE",
        "concrete rubble": "PLAIN_CONCRETE",
        "mortar": "PLAIN_CONCRETE",
        "wood": "WOOD",
        "timber": "WOOD",
        "steel": "METAL",
        "metal": "METAL",
        "glass": "GLASS",
        "plastic": "WASTE_SYNTHETIC_RESIN",
        "asphalt": "MIXED_WASTE",
        "plasterboard": "GYPSUM_BOARD",
        "gypsum": "GYPSUM_BOARD",
    },
}

# 공개 데이터로 라벨을 얻을 수 없어 자체 수집이 반드시 필요한 코드(기획서 핵심 자산).
SELF_COLLECT_REQUIRED: Dict[str, str] = {
    "ROOFING_SLATE": (
        "석면 슬레이트 지붕은 공개 라벨 데이터가 없음(연구용도 비공개). "
        "양평 자체 촬영(드론 저고도 3cm/px 근접)으로 수집. 안전-치명 지표(재현율 0.95)."
    ),
    "REINFORCED_CONCRETE": (
        "공개 'concrete'는 철근/무근 미구분. 철근 노출 근접 이미지는 자체 수집으로 보강."
    ),
}


def map_class(dataset: str, raw_class: str) -> Optional[str]:
    """원본 클래스명을 우리 12종 코드로. 매핑 없으면 None(무시 대상)."""
    table = DATASET_CLASS_MAP.get(dataset)
    if not table:
        raise KeyError(f"알 수 없는 데이터셋: {dataset!r}. 지원: {sorted(DATASET_CLASS_MAP)}")
    return table.get(raw_class.strip().lower())


def hazards_for(codes: List[str]) -> List[Dict[str, str]]:
    """자재 코드 목록에서 위험(석면 의심) 표식 생성. 공개 데이터엔 통상 비어 있다."""
    hazards: List[Dict[str, str]] = []
    for code in codes:
        if is_asbestos_suspect_material(code):
            hazards.append({"type": "ASBESTOS_SUSPECT", "material_code": code})
    return hazards


def coverage_report(dataset: str) -> Dict[str, object]:
    """이 데이터셋이 우리 12종 중 무엇을 커버하는지 리포트. 콜드스타트 계획용."""
    table = DATASET_CLASS_MAP.get(dataset, {})
    covered = sorted(set(table.values()))
    all_codes = list(MATERIAL_TAXONOMY_V1.keys())
    missing = [c for c in all_codes if c not in covered]
    return {
        "dataset": dataset,
        "covered_codes": covered,
        "covered_count": len(covered),
        "total_codes": len(all_codes),
        "missing_codes": missing,
        "self_collect_required": {c: SELF_COLLECT_REQUIRED.get(c) for c in missing if c in SELF_COLLECT_REQUIRED},
    }
