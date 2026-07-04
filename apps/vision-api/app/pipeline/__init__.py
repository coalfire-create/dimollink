"""파이프라인 팩토리 — 설정에 따라 mock/vllm 구현체 선택."""

from __future__ import annotations

from ..config import Settings
from .base import AnalysisPipeline, StageCallback
from .mock import MockPipeline
from .vllm import VLLMPipeline

__all__ = ["AnalysisPipeline", "StageCallback", "MockPipeline", "VLLMPipeline", "get_pipeline"]


def get_pipeline(settings: Settings) -> AnalysisPipeline:
    if settings.pipeline == "vllm":
        return VLLMPipeline(settings.model_base, settings.model_adapter_hash)
    return MockPipeline(settings.model_version)
