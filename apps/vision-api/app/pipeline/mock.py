"""목(mock) 파이프라인 — GPU 없이 스키마 유효한 리포트를 생성 (로컬/CI/E2E 골격).

파일럿 범위(양평 저층 주택·슬레이트 지붕)를 가정한 고정형 리포트를 낸다.
실제 인식이 아니라 배관(파이프라인·잡 큐·콜백·검증) 검증용이다.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from ..schemas import (
    HazardItem,
    JobCreateRequest,
    JobStage,
    MaterialItem,
    ProcessStep,
    QuantityEstimate,
    SafetyGuideline,
    SiteSummary,
    VisionReport,
    WasteItem,
    WastePlan,
)
from ..taxonomy import (
    ASBESTOS_SUSPECT_GUIDANCE,
    REPORT_DISCLAIMER,
    is_allbaro_manifest_required,
)
from .base import StageCallback


class MockPipeline:
    def __init__(self, model_version: str, stage_delay: float = 0.0) -> None:
        self._model_version = model_version
        self._stage_delay = stage_delay

    async def analyze(
        self, request: JobCreateRequest, on_stage: StageCallback
    ) -> VisionReport:
        # 진행 단계 순차 보고(§3.2): 자재 인식 → 지침 검색 → 공정표 생성
        for stage in (
            JobStage.RECOGNITION,
            JobStage.GUIDELINE_SEARCH,
            JobStage.PROCESS_GENERATION,
        ):
            await on_stage(stage)
            if self._stage_delay:
                await asyncio.sleep(self._stage_delay)

        waste_items = [
            WasteItem(
                category="BRICK_MASONRY",
                estimated_amount=QuantityEstimate(value_min=6.0, value_max=9.0, unit="ton"),
                disposal_method="건설폐기물 중간처리업체 위탁",
            ),
            WasteItem(
                category="ROOFING_SLATE",
                estimated_amount=QuantityEstimate(value_min=1.0, value_max=2.0, unit="ton"),
                disposal_method="석면 조사 결과에 따라 지정폐기물 절차 적용",
            ),
        ]
        total_ton_mid = sum(
            (w.estimated_amount.value_min + w.estimated_amount.value_max) / 2
            for w in waste_items
        )
        allbaro_required = is_allbaro_manifest_required(total_ton_mid)

        return VisionReport(
            site_summary=SiteSummary(
                building_type="저층 주택",
                structure="MASONRY",
                scale_estimate="연면적 약 90~120㎡ 추정(사진 기반, 참고용)",
                photo_quality_warnings=[],
            ),
            materials=[
                MaterialItem(
                    category="BRICK_MASONRY",
                    confidence=0.82,
                    location_note="외벽 조적",
                    quantity_estimate=QuantityEstimate(value_min=6.0, value_max=9.0, unit="ton"),
                ),
                MaterialItem(
                    category="ROOFING_SLATE",
                    confidence=0.71,
                    location_note="지붕 슬레이트로 관찰됨(석면 의심)",
                    quantity_estimate=QuantityEstimate(value_min=1.0, value_max=2.0, unit="ton"),
                ),
            ],
            hazards=[
                HazardItem(
                    type="ASBESTOS_SUSPECT",
                    description="슬레이트 지붕재가 관찰되어 석면 함유가 의심됩니다.",
                    guidance=ASBESTOS_SUSPECT_GUIDANCE,
                ),
            ],
            process_steps=[
                ProcessStep(
                    order=1,
                    task_name="사전 조사 및 지장물 처리",
                    sub_tasks=["전기·가스 차단 확인", "석면 전문조사 의뢰 여부 확인"],
                    required_equipment=["개인보호구"],
                    required_workforce="2인",
                    estimated_duration="0.5일",
                    safety_guidelines=[
                        SafetyGuideline(
                            text="해체 착공 전 지장물 및 위험요인을 조사한다.",
                            source_document="KOSHA 해체공사 안전보건작업 지침",
                        ),
                    ],
                ),
                ProcessStep(
                    order=2,
                    task_name="지붕재 처리(석면 조사 결과 반영)",
                    sub_tasks=["전문 조사기관 결과 확인 후 절차 결정"],
                    required_equipment=["고소작업 안전장비"],
                    required_workforce="전문 인력",
                    estimated_duration="현장 조건에 따름",
                    safety_guidelines=[
                        SafetyGuideline(
                            text="석면이 의심되는 자재는 임의 제거하지 않고 전문 조사·처리 절차를 따른다.",
                            source_document="석면안전관리법 관련 고시",
                        ),
                    ],
                ),
            ],
            waste_plan=WastePlan(
                items=waste_items,
                allbaro_manifest_required=allbaro_required,
                allbaro_reason=(
                    f"건설폐기물 예상 총량 약 {total_ton_mid:.1f}톤 — 5톤 이상 의무 대상"
                    if allbaro_required
                    else "예상 총량 5톤 미만 — 의무 대상 아님"
                ),
            ),
            disclaimer=REPORT_DISCLAIMER,
            model_version=self._model_version,
            analyzed_at=datetime.now(timezone.utc).isoformat(),
        )
