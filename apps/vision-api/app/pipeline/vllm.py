"""vLLM + Qwen3-VL LoRA 2-패스 파이프라인 (기획서 §3.3, §4 — GPU 서빙).

⚠️ 미구현 골격. 실제 추론은 GPU 인스턴스 + 파인튜닝 어댑터가 있어야 하며
Phase V1(프롬프트 구성)~V3(파인튜닝) 에서 채운다. 현재는 인터페이스만 고정한다.

구현 예정 흐름:
  1패스(인식): 사진들을 VLM(JSON mode)에 넣어 materials/hazards 구조화 추출.
               석면 등 위험 인식은 best-of-3 자기일관성 검증(§6.1).
  지침 검색:   materials/hazards 로 RAG(pgvector, BGE-M3 임베딩) 안전지침 청크 검색.
  2패스(생성): 1패스 결과 + 부가정보 + 검색 청크를 컨텍스트로 process_steps/waste_plan 생성.
               안전 지침은 반드시 검색된 근거를 인용(§3.4).
출력은 반드시 validation.validate_report 를 통과해야 저장/콜백한다.
"""

from __future__ import annotations

from ..schemas import JobCreateRequest, VisionReport
from .base import StageCallback


class VLLMPipeline:
    def __init__(self, model_base: str, adapter_hash: str) -> None:
        self.model_base = model_base
        self.adapter_hash = adapter_hash

    async def analyze(
        self, request: JobCreateRequest, on_stage: StageCallback
    ) -> VisionReport:
        raise NotImplementedError(
            "vLLM 2-패스 파이프라인은 아직 미구현입니다 (Phase V1/V3). "
            "VISION_PIPELINE=mock 으로 로컬 검증하세요."
        )
