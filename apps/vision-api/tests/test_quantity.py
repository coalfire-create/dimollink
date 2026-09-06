"""물량 산정 — 연면적 원단위 × 성상 구성비(§2.2).

핵심 불변식: 모델은 물량을 추정하지 않는다. 연면적을 알면 계산이 답을 내고,
모르면 0 범위(현장 실측 필요)로 남긴다 — 어느 쪽도 숫자를 지어내지 않는다.
"""

from __future__ import annotations

from app.quantity import (
    DEMOLITION_TON_PER_M2,
    build_waste_plan,
    estimation_structure,
    floor_area_from_meta,
    quantity_by_material,
    resolve_composition,
    total_waste_ton,
)


def test_total_waste_ton_uses_structure_factor():
    assert total_waste_ton(100, "RC") == 100 * DEMOLITION_TON_PER_M2
    # 조적·목조는 같은 연면적이라도 발생량이 작다.
    assert total_waste_ton(100, "BRICK") < total_waste_ton(100, "RC")
    assert total_waste_ton(100, "WOOD") < total_waste_ton(100, "BRICK")


def test_floor_area_from_meta_accepts_web_form_strings():
    assert floor_area_from_meta({"floor_area": "120"}) == 120.0
    assert floor_area_from_meta({"floor_area_m2": 85.5}) == 85.5
    assert floor_area_from_meta({}) is None
    assert floor_area_from_meta({"floor_area": "0"}) is None
    assert floor_area_from_meta({"floor_area": "미상"}) is None


def test_floor_area_multiplies_floors_only_for_base_area():
    # 연면적으로 들어온 값에 층수를 다시 곱하면 안 된다.
    assert floor_area_from_meta({"floor_area": "100", "floors": 3}) == 100.0
    # 바닥면적으로 들어온 값은 층수를 곱한다.
    assert floor_area_from_meta({"base_area_m2": 100, "floors": 3}) == 300.0


def test_estimation_structure_maps_report_codes():
    assert estimation_structure("MASONRY", {}) == "BRICK"
    assert estimation_structure("STEEL", {}) == "RC"  # 중량 철골은 RC 원단위
    assert estimation_structure("WOOD", {}) == "WOOD"
    assert estimation_structure("UNKNOWN", {}) == "RC"  # 기본 구조
    assert estimation_structure(None, {"structure": "MASONRY"}) == "BRICK"


def test_composition_sums_to_one_and_is_structure_specific():
    for structure in ("RC", "BRICK", "WOOD"):
        ratios = resolve_composition(structure)
        assert abs(sum(ratios.values()) - 1.0) < 1e-9
    assert resolve_composition("RC")["REINFORCED_CONCRETE"] > 0.7
    assert resolve_composition("BRICK")["BRICK_MASONRY"] > resolve_composition("BRICK")["PLAIN_CONCRETE"]


def test_composition_keeps_structural_materials_not_seen_in_photos():
    # 목조 주택 내부만 찍혀 목재만 인식돼도 기초 콘크리트가 빠지면 안 된다.
    ratios = resolve_composition("WOOD", detected=["WOOD"])
    assert ratios["PLAIN_CONCRETE"] > 0


def test_composition_admits_photo_only_materials():
    ratios = resolve_composition("RC", detected=["ROOFING_SLATE"])
    assert ratios["ROOFING_SLATE"] > 0


def test_composition_clamps_exaggerated_hints():
    # "유리가 전체의 60%" 같은 힌트가 그대로 통과하면 안 된다.
    ratios = resolve_composition("RC", detected=["GLASS"], hints={"GLASS": 0.6})
    assert ratios["GLASS"] < 0.05
    assert ratios["REINFORCED_CONCRETE"] > ratios["GLASS"]


def test_quantity_is_empty_without_floor_area():
    assert quantity_by_material(["REINFORCED_CONCRETE"], "RC", None) == {}


def test_quantity_ranges_scale_with_area():
    small = quantity_by_material(["REINFORCED_CONCRETE"], "RC", 100)
    large = quantity_by_material(["REINFORCED_CONCRETE"], "RC", 200)
    assert large["REINFORCED_CONCRETE"]["value_max"] > small["REINFORCED_CONCRETE"]["value_max"]
    # 단일 수치가 아니라 범위로만 표기한다(§2.2).
    rc = small["REINFORCED_CONCRETE"]
    assert rc["value_min"] < rc["value_max"] and rc["unit"] == "ton"


def test_build_waste_plan_sorts_by_amount_and_uses_disposal_table():
    plan = build_waste_plan(["ROOFING_SLATE"], "RC", {"floor_area": "100"})
    assert plan is not None
    amounts = [i["estimated_amount"]["value_max"] for i in plan["items"]]
    assert amounts == sorted(amounts, reverse=True)
    assert plan["items"][0]["category"] == "REINFORCED_CONCRETE"
    slate = next(i for i in plan["items"] if i["category"] == "ROOFING_SLATE")
    # 슬레이트 처리 방법은 표에서 고정 — 모델이 지어내지 않는다.
    assert "석면 사전조사" in slate["disposal_method"]


def test_build_waste_plan_returns_none_without_area():
    assert build_waste_plan(["REINFORCED_CONCRETE"], "RC", {}) is None
