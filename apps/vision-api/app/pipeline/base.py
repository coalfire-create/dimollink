"""추론 파이프라인 인터페이스 (기획서 §3.3 — 2-패스: 인식 → 생성)."""

from __future__ import annotations

from typing import Awaitable, Callable

from typing_extensions import Protocol, runtime_checkable

from ..schemas import JobCreateRequest, JobStage, VisionReport

# 진행 단계 콜백 — worker 가 넘겨주며, 저장소 업데이트 + Supabase 콜백을 트리거한다.
StageCallback = Callable[[JobStage], Awaitable[None]]


@runtime_checkable
class AnalysisPipeline(Protocol):
    """사진 → 분석 리포트. 구현체: MockPipeline(로컬/CI), VLLMPipeline(GPU)."""

    async def analyze(
        self, request: JobCreateRequest, on_stage: StageCallback
    ) -> VisionReport: ...
