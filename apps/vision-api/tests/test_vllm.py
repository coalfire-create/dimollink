"""vLLM 파이프라인의 GPU 비의존 부분 테스트(안전 후처리·팩토리·검색 쿼리).

실제 추론(analyze)은 GPU/vLLM 서버가 필요해 여기서 검증하지 않는다.
"""

from app.config import get_settings
from app.pipeline import get_pipeline
from app.pipeline.vllm import VLLMPipeline
from app.schemas import (
    HazardItem,
    QuantityEstimate,
    SiteSummary,
    VisionReport,
    WasteItem,
    WastePlan,
)


def _report(**overrides) -> VisionReport:
    data = dict(
        site_summary=SiteSummary(building_type="주택", structure="MASONRY", scale_estimate="약 100㎡", photo_quality_warnings=[]),
        materials=[],
        hazards=[HazardItem(type="ASBESTOS_SUSPECT", description="슬레이트 관찰", guidance="주의")],
        process_steps=[],
        waste_plan=WastePlan(
            items=[
                WasteItem(
                    category="BRICK_MASONRY",
                    estimated_amount=QuantityEstimate(value_min=6, value_max=9, unit="ton"),
                    disposal_method="위탁",
                )
            ],
            allbaro_manifest_required=False,  # 일부러 틀리게
            allbaro_reason="(계산 전)",
        ),
        disclaimer="임의 문구",  # 일부러 틀리게
    )
    data.update(overrides)
    return VisionReport(**data)


def test_enforce_safety_fixes_disclaimer_guidance_and_allbaro():
    fixed = VLLMPipeline._enforce_safety(_report())
    # 고지 고정
    assert "해체계획서 및 전문가 검토를 대체하지 않습니다" in fixed.disclaimer
    # 석면 안내 보강
    assert "석면안전관리법에 따른 전문 조사기관 조사 필요" in fixed.hazards[0].guidance
    # 6~9톤(평균 7.5) → 5톤 이상 의무 대상으로 재계산
    assert fixed.waste_plan.allbaro_manifest_required is True
    assert "7.5" in fixed.waste_plan.allbaro_reason


def test_enforce_safety_under_5_ton_not_required():
    fixed = VLLMPipeline._enforce_safety(
        _report(
            waste_plan=WastePlan(
                items=[
                    WasteItem(
                        category="ROOFING_SLATE",
                        estimated_amount=QuantityEstimate(value_min=1, value_max=2, unit="ton"),
                        disposal_method="위탁",
                    )
                ],
                allbaro_manifest_required=True,
                allbaro_reason="(계산 전)",
            )
        )
    )
    assert fixed.waste_plan.allbaro_manifest_required is False


def test_get_pipeline_returns_vllm(monkeypatch):
    monkeypatch.setenv("VISION_PIPELINE", "vllm")
    get_settings.cache_clear()
    try:
        pipe = get_pipeline(get_settings())
        assert isinstance(pipe, VLLMPipeline)
    finally:
        get_settings.cache_clear()
