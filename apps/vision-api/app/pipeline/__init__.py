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
    """RAG 검색기 구성. pg 백엔드면 PgRetriever, 아니면 인메모리(원문+임베딩)."""
    from ..kb import build_inmemory_retriever, get_embedder

    embedder = get_embedder(settings.kb_embedder, model_path=settings.model_base) if settings.kb_embedder == "bge-m3" else get_embedder("mock")

    if settings.kb_backend == "pg" and settings.db_url:
        from ..kb import PgRetriever

        return PgRetriever(settings.db_url, embedder)

    sources_dir = settings.kb_sources_dir
    if not os.path.isdir(sources_dir):
        # cwd 상대 경로가 없으면 패키지 기준으로 보정.
        pkg_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        sources_dir = os.path.join(os.path.dirname(pkg_dir), settings.kb_sources_dir)
    if not os.path.isdir(sources_dir):
        logger.warning("KB 원문 디렉터리를 찾지 못해 검색기 없이 동작합니다: %s", settings.kb_sources_dir)
        return None
    return build_inmemory_retriever(sources_dir, embedder)


def get_pipeline(settings: Settings) -> AnalysisPipeline:
    retriever = _build_retriever(settings)
    if settings.pipeline == "vllm":
        return VLLMPipeline(
            model=settings.model_base,
            model_version=settings.model_version,
            base_url=settings.vllm_base_url,
            api_key=settings.vllm_api_key,
            retriever=retriever,
            top_k=settings.kb_top_k,
            timeout=settings.job_timeout_seconds,
            lora=settings.vllm_lora,
        )
    return MockPipeline(settings.model_version, retriever=retriever, top_k=settings.kb_top_k)
