"""파이프라인 팩토리 — 설정에 따라 mock/vllm 구현체 선택."""

from __future__ import annotations

import logging
import os

from ..config import Settings
from .base import AnalysisPipeline, StageCallback
from .mock import MockPipeline
from .vllm import VLLMPipeline

__all__ = ["AnalysisPipeline", "StageCallback", "MockPipeline", "VLLMPipeline", "get_pipeline"]

logger = logging.getLogger("vision.pipeline")


def _build_retriever(settings: Settings):
    """로컬/CI 용 인메모리 RAG 검색기(mock 임베딩). 원문 없으면 None → 지침 fallback."""
    from ..kb import MockEmbedder, build_inmemory_retriever

    sources_dir = settings.kb_sources_dir
    if not os.path.isdir(sources_dir):
        # cwd 상대 경로가 없으면 패키지 기준으로 보정.
        pkg_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        sources_dir = os.path.join(os.path.dirname(pkg_dir), settings.kb_sources_dir)
    if not os.path.isdir(sources_dir):
        logger.warning("KB 원문 디렉터리를 찾지 못해 검색기 없이 동작합니다: %s", settings.kb_sources_dir)
        return None
    return build_inmemory_retriever(sources_dir, MockEmbedder())


def get_pipeline(settings: Settings) -> AnalysisPipeline:
    if settings.pipeline == "vllm":
        return VLLMPipeline(settings.model_base, settings.model_adapter_hash)
    return MockPipeline(
        settings.model_version,
        retriever=_build_retriever(settings),
        top_k=settings.kb_top_k,
    )
