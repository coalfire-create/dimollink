"""요청/응답 및 분석 리포트 스키마 (기획서 §2.2, §5.1).

리포트 필드는 packages/shared 의 VisionReport 와 1:1 로 일치하는 snake_case wire 계약이다.
"""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


# --- 잡 상태/단계 ---------------------------------------------------------


class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"
    CANCELED = "canceled"


class JobStage(str, Enum):
    """진행 단계(§3.2): 자재 인식 → 지침 검색 → 공정표 생성."""

    RECOGNITION = "recognition"
    GUIDELINE_SEARCH = "guideline_search"
    PROCESS_GENERATION = "process_generation"


# --- 분석 리포트 스키마 (VisionReport 미러) -------------------------------


class QuantityEstimate(BaseModel):
    value_min: float
    value_max: float
    unit: str = Field(description="'m3' | 'ton'")


class SiteSummary(BaseModel):
    building_type: str
    structure: str = Field(description="'RC'|'MASONRY'|'WOOD'|'STEEL'|'UNKNOWN'")
    scale_estimate: str
    photo_quality_warnings: List[str] = Field(default_factory=list)


class MaterialItem(BaseModel):
    category: str
    confidence: float = Field(ge=0.0, le=1.0)
    location_note: str
    quantity_estimate: QuantityEstimate


class HazardItem(BaseModel):
    type: str
    description: str
    guidance: str


class SafetyGuideline(BaseModel):
    text: str
    source_document: str
    source_clause: Optional[str] = None


class ProcessStep(BaseModel):
    order: int
    task_name: str
    sub_tasks: List[str] = Field(default_factory=list)
    required_equipment: List[str] = Field(default_factory=list)
    required_workforce: str
    estimated_duration: str
    safety_guidelines: List[SafetyGuideline] = Field(default_factory=list)


class WasteItem(BaseModel):
    category: str
    estimated_amount: QuantityEstimate
    disposal_method: str


class WastePlan(BaseModel):
    items: List[WasteItem] = Field(default_factory=list)
    allbaro_manifest_required: bool
    allbaro_reason: str


class VisionReport(BaseModel):
    site_summary: SiteSummary
    materials: List[MaterialItem] = Field(default_factory=list)
    hazards: List[HazardItem] = Field(default_factory=list)
    process_steps: List[ProcessStep] = Field(default_factory=list)
    waste_plan: WastePlan
    disclaimer: str
    model_version: Optional[str] = None
    analyzed_at: Optional[str] = None


# --- 잡 생성/조회 DTO -----------------------------------------------------


class JobCreateRequest(BaseModel):
    """POST /v1/jobs 입력 (Edge Function 이 사진 서명 URL·부가정보·콜백 URL 전달)."""

    photo_urls: List[str] = Field(min_length=1)
    input_meta: Dict[str, object] = Field(default_factory=dict)
    callback_url: Optional[str] = None


class JobResponse(BaseModel):
    id: str
    status: JobStatus
    stage: Optional[JobStage] = None
    result: Optional[VisionReport] = None
    model_version: str
    error: Optional[str] = None
    attempts: int = 0
    created_at: str
    updated_at: str
