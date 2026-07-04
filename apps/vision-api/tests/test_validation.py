"""출력 검증 레이어 단위 테스트 (기획서 §7.1)."""

from app.schemas import (
    HazardItem,
    MaterialItem,
    ProcessStep,
    QuantityEstimate,
    SafetyGuideline,
    SiteSummary,
    VisionReport,
    WastePlan,
)
from app.taxonomy import ASBESTOS_SUSPECT_GUIDANCE, REPORT_DISCLAIMER
from app.validation import validate_report


def _base_report(**overrides) -> VisionReport:
    data = dict(
        site_summary=SiteSummary(
            building_type="주택", structure="MASONRY", scale_estimate="약 100㎡", photo_quality_warnings=[]
        ),
        materials=[
            MaterialItem(
                category="ROOFING_SLATE",
                confidence=0.7,
                location_note="지붕 슬레이트(석면 의심)",
                quantity_estimate=QuantityEstimate(value_min=1, value_max=2, unit="ton"),
            )
        ],
        hazards=[HazardItem(type="ASBESTOS_SUSPECT", description="슬레이트 관찰", guidance=ASBESTOS_SUSPECT_GUIDANCE)],
        process_steps=[
            ProcessStep(
                order=1,
                task_name="사전 조사",
                required_workforce="2인",
                estimated_duration="0.5일",
                safety_guidelines=[SafetyGuideline(text="보호구 착용", source_document="KOSHA")],
            )
        ],
        waste_plan=WastePlan(items=[], allbaro_manifest_required=False, allbaro_reason="5톤 미만"),
        disclaimer=REPORT_DISCLAIMER,
    )
    data.update(overrides)
    return VisionReport(**data)


def test_valid_report_passes():
    assert validate_report(_base_report()) == []


def test_wrong_disclaimer_flagged():
    issues = validate_report(_base_report(disclaimer="임의 문구"))
    assert any("disclaimer" in i for i in issues)


def test_slate_without_asbestos_hazard_flagged():
    issues = validate_report(_base_report(hazards=[]))
    assert any("ASBESTOS_SUSPECT" in i for i in issues)


def test_asbestos_hazard_missing_guidance_flagged():
    bad = _base_report(hazards=[HazardItem(type="ASBESTOS_SUSPECT", description="슬레이트", guidance="주의")])
    issues = validate_report(bad)
    assert any("전문 조사 안내" in i for i in issues)


def test_forbidden_asbestos_confirmation_flagged():
    bad = _base_report(
        process_steps=[
            ProcessStep(
                order=1,
                task_name="검토",
                required_workforce="1인",
                estimated_duration="1일",
                safety_guidelines=[SafetyGuideline(text="이 지붕은 석면 없음", source_document="x")],
            )
        ]
    )
    issues = validate_report(bad)
    assert any("확정" in i for i in issues)


def test_invalid_material_code_flagged():
    issues = validate_report(
        _base_report(
            materials=[
                MaterialItem(
                    category="UNKNOWN_STUFF",
                    confidence=0.5,
                    location_note="?",
                    quantity_estimate=QuantityEstimate(value_min=1, value_max=2, unit="ton"),
                )
            ],
            hazards=[],
        )
    )
    assert any("분류 체계" in i for i in issues)
