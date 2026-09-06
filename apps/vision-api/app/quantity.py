"""물량 산정 — "얼마나 나오는가"를 사진이 아니라 계산으로 푼다.

⚠️ 단일 원천은 `packages/shared/src/estimation.ts` + `packages/shared/src/waste-composition.ts` 다.
이 파일은 AI 서버(Python) 측 미러이며, 상수를 바꿀 때는 양쪽을 함께 고쳐야 한다.

배경: 예전에는 2패스 생성 LLM 이 waste_plan 의 톤수까지 지어냈고, 그 숫자로
올바로 의무신고(5톤) 여부까지 판정했다. 환각 수치가 법적 판단으로 이어지는 구조라
물량만은 결정론적으로 계산해 LLM 출력을 덮어쓴다.

  총량(톤) = 연면적(㎡) × 원단위 × 구조계수
  성상별   = 총량 × 구조별 구성비(사진에서 확인된 자재는 편입, 힌트는 클램프)
"""

from __future__ import annotations

from typing import Dict, List, Optional, Sequence

from .taxonomy import MATERIAL_TAXONOMY_V1

# --- estimation.ts 미러 ---------------------------------------------------

DEMOLITION_TON_PER_M2 = 1.58
STRUCTURE_FACTORS: Dict[str, float] = {"RC": 1.0, "BRICK": 0.73, "WOOD": 0.33}
ESTIMATE_RANGE_RATIO = 0.3

# --- waste-composition.ts 미러 --------------------------------------------

MATERIAL_COMPOSITION_BY_STRUCTURE: Dict[str, Dict[str, float]] = {
    "RC": {
        "REINFORCED_CONCRETE": 0.84,
        "METAL": 0.05,
        "BRICK_MASONRY": 0.03,
        "WOOD": 0.02,
        "GYPSUM_BOARD": 0.01,
        "SANITARY_TILE": 0.01,
        "WASTE_SYNTHETIC_RESIN": 0.01,
        "MIXED_WASTE": 0.03,
    },
    "BRICK": {
        "BRICK_MASONRY": 0.48,
        "PLAIN_CONCRETE": 0.26,
        "WOOD": 0.06,
        "METAL": 0.04,
        "SANITARY_TILE": 0.03,
        "GYPSUM_BOARD": 0.02,
        "WASTE_SYNTHETIC_RESIN": 0.02,
        "MIXED_WASTE": 0.09,
    },
    "WOOD": {
        "WOOD": 0.38,
        "PLAIN_CONCRETE": 0.30,
        "BRICK_MASONRY": 0.08,
        "METAL": 0.05,
        "GYPSUM_BOARD": 0.04,
        "WASTE_SYNTHETIC_RESIN": 0.04,
        "SANITARY_TILE": 0.02,
        "MIXED_WASTE": 0.09,
    },
}

DEFAULT_COMPOSITION_STRUCTURE = "RC"
DETECTED_EXTRA_RATIO = 0.02
COMPOSITION_HINT_CLAMP = 2

# 리포트 구조 코드(VisionStructureType) → 원단위 구조(BuildingStructure).
_STRUCTURE_TO_ESTIMATION = {
    "RC": "RC",
    "STEEL": "RC",
    "MASONRY": "BRICK",
    "WOOD": "WOOD",
}

# 성상별 기본 처리 방법(분리배출 기준). LLM 이 지어내지 않게 표로 고정한다.
DISPOSAL_METHOD_BY_CODE: Dict[str, str] = {
    "REINFORCED_CONCRETE": "중간처리(파쇄) 후 순환골재 재활용",
    "PLAIN_CONCRETE": "중간처리(파쇄) 후 순환골재 재활용",
    "BRICK_MASONRY": "중간처리(파쇄) 후 순환골재 재활용",
    "WOOD": "폐목재 재활용(파티클보드·연료화) — 방부처리재는 별도 분리",
    "METAL": "고철 분리 매각(재활용)",
    "GLASS": "폐유리 재활용 또는 매립",
    "GYPSUM_BOARD": "폐석고보드 전용 재활용업체 위탁",
    "ROOFING_SLATE": "석면 사전조사 후 지정폐기물 절차에 따라 전문업체 위탁",
    "WATERPROOF_INSULATION": "성상 확인 후 소각 또는 매립",
    "WASTE_SYNTHETIC_RESIN": "폐합성수지 재활용 또는 소각",
    "SANITARY_TILE": "건설폐재류로 분리 배출",
    "MIXED_WASTE": "혼합건설폐기물 — 선별 중간처리 위탁",
}

_DEFAULT_DISPOSAL = "관계 법령에 따른 분리 배출 후 적정 처리"


def _clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def _as_float(value: object) -> Optional[float]:
    """input_meta 값은 웹 폼에서 문자열로 오기도 한다."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if value > 0 else None
    if isinstance(value, str):
        try:
            parsed = float(value.strip().replace(",", ""))
        except ValueError:
            return None
        return parsed if parsed > 0 else None
    return None


# 연면적으로 그대로 쓰는 키(웹 폼의 '연면적(㎡)' 포함).
_TOTAL_AREA_KEYS = ("total_floor_area_m2", "floor_area_m2", "floor_area", "total_area")
# 한 층 바닥면적 키 — 층수를 곱해야 연면적이 된다.
_BASE_AREA_KEYS = ("base_area_m2", "arch_area")


def floor_area_from_meta(input_meta: Dict[str, object]) -> Optional[float]:
    """부가정보에서 연면적(㎡)을 찾는다. 바닥면적으로 들어온 경우만 층수를 곱한다."""
    for key in _TOTAL_AREA_KEYS:
        area = _as_float(input_meta.get(key))
        if area is not None:
            return area
    for key in _BASE_AREA_KEYS:
        area = _as_float(input_meta.get(key))
        if area is not None:
            floors = _as_float(input_meta.get("floors")) or _as_float(
                input_meta.get("grnd_flr_cnt")
            )
            return area * floors if floors and floors > 1 else area
    return None


def estimation_structure(structure: Optional[str], input_meta: Dict[str, object]) -> str:
    """리포트 구조 코드나 부가정보에서 원단위 구조를 정한다."""
    raw = structure or input_meta.get("structure")
    if isinstance(raw, str):
        code = _STRUCTURE_TO_ESTIMATION.get(raw.upper())
        if code:
            return code
    return DEFAULT_COMPOSITION_STRUCTURE


def total_waste_ton(floor_area_m2: float, structure: str) -> float:
    """연면적 × 원단위 × 구조계수 → 예상 총 발생량(톤)."""
    factor = STRUCTURE_FACTORS.get(structure, STRUCTURE_FACTORS[DEFAULT_COMPOSITION_STRUCTURE])
    return floor_area_m2 * DEMOLITION_TON_PER_M2 * factor


def resolve_composition(
    structure: str,
    detected: Sequence[str] = (),
    hints: Optional[Dict[str, float]] = None,
) -> Dict[str, float]:
    """구조 표 + 사진 관찰을 합친 최종 구성비(합=1). waste-composition.ts 와 동일 규칙."""
    base = MATERIAL_COMPOSITION_BY_STRUCTURE.get(
        structure, MATERIAL_COMPOSITION_BY_STRUCTURE[DEFAULT_COMPOSITION_STRUCTURE]
    )
    hints = hints or {}
    weights: Dict[str, float] = {}

    # ① 구조 표의 자재 — 사진에 안 보여도 유지한다(기초 콘크리트·지하 구조물).
    for code, ratio in base.items():
        hint = hints.get(code)
        weights[code] = (
            _clamp(hint, ratio / COMPOSITION_HINT_CLAMP, ratio * COMPOSITION_HINT_CLAMP)
            if hint and hint > 0
            else ratio
        )

    # ② 사진에서만 확인된 자재 — 기본 비율 대비 클램프해 편입.
    for code in detected:
        if code not in MATERIAL_TAXONOMY_V1 or code in weights:
            continue
        hint = hints.get(code)
        weights[code] = (
            _clamp(
                hint,
                DETECTED_EXTRA_RATIO / COMPOSITION_HINT_CLAMP,
                DETECTED_EXTRA_RATIO * COMPOSITION_HINT_CLAMP,
            )
            if hint and hint > 0
            else DETECTED_EXTRA_RATIO
        )

    total = sum(v for v in weights.values() if v > 0)
    if total <= 0:
        return {}
    return {code: v / total for code, v in weights.items() if v > 0}


def _range(value: float) -> Dict[str, float]:
    """단일 수치로 과도한 정밀도를 주장하지 않고 ±비율 범위로 표기한다(§2.2)."""
    return {
        "value_min": round(value * (1 - ESTIMATE_RANGE_RATIO), 2),
        "value_max": round(value * (1 + ESTIMATE_RANGE_RATIO), 2),
        "unit": "ton",
    }


def quantity_by_material(
    codes: Sequence[str], structure: str, floor_area_m2: Optional[float]
) -> Dict[str, Dict[str, float]]:
    """자재 코드 → 예상 물량 범위. 연면적을 모르면 빈 dict(수치를 지어내지 않는다)."""
    if not floor_area_m2:
        return {}
    total = total_waste_ton(floor_area_m2, structure)
    ratios = resolve_composition(structure, codes)
    return {code: _range(total * ratio) for code, ratio in ratios.items()}


def build_waste_plan(
    codes: Sequence[str], structure: str, input_meta: Dict[str, object]
) -> Optional[Dict[str, object]]:
    """성상별 처리 계획을 계산으로 만든다. 연면적을 모르면 None(LLM 출력 유지).

    비중이 큰 성상부터 나열하고, 처리 방법은 표에서 가져온다.
    """
    floor_area_m2 = floor_area_from_meta(input_meta)
    quantities = quantity_by_material(codes, structure, floor_area_m2)
    if not quantities:
        return None

    items: List[Dict[str, object]] = [
        {
            "category": code,
            "estimated_amount": amount,
            "disposal_method": DISPOSAL_METHOD_BY_CODE.get(code, _DEFAULT_DISPOSAL),
        }
        for code, amount in sorted(
            quantities.items(),
            key=lambda kv: kv[1]["value_max"],
            reverse=True,
        )
    ]
    return {"items": items, "allbaro_manifest_required": False, "allbaro_reason": ""}
