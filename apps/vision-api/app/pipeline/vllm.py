"""vLLM + Qwen3-VL 2-패스 파이프라인 (기획서 §3.3, §3.4, §4).

vLLM 의 OpenAI 호환 서버(/v1/chat/completions)를 호출한다. GPU·모델(선택 fine-tune 어댑터)이
있어야 동작하며, guided_json(구조화 디코딩)으로 스키마 고정 출력을 강제한다.

⚠️ GPU/vLLM 미가용 환경에서는 실행 검증 불가. 출력은 worker 가 validate_report(§7.1)로 재검증하므로,
석면 확정 표현 등 위반은 저장/콜백되지 않고 실패 처리된다. 여기서도 안전 후처리를 1차로 적용한다.

파이프라인:
  1패스(인식): 사진 → site_summary/materials/hazards (JSON)
  지침 검색  : materials/hazards 로 RAG 검색(retriever)
  2패스(생성): 1패스 결과 + 부가정보 + 검색 청크 → process_steps/waste_plan (JSON, 근거 인용)
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import List, Optional

import httpx

from ..schemas import (
    HazardItem,
    JobCreateRequest,
    JobStage,
    ProcessStep,
    SiteSummary,
    VisionReport,
    WastePlan,
)
from ..taxonomy import (
    ASBESTOS_SUSPECT_GUIDANCE,
    MATERIAL_CODES,
    REPORT_DISCLAIMER,
    is_allbaro_manifest_required,
)
from .base import StageCallback

_RECOGNITION_SYSTEM = (
    "너는 철거 현장 사진을 분석하는 전문가다. 주어진 사진에서 구성 자재와 위험 요소를 식별해 "
    "JSON 으로만 답한다. 자재 category 는 반드시 다음 코드 중에서 고른다: "
    + ", ".join(MATERIAL_CODES)
    + ". confidence 는 0~1. 물량은 확정 수치가 아닌 범위(value_min/value_max)로만 표기한다. "
    "석면은 유무를 확정하지 말고 '의심'까지만 표현한다. 슬레이트·뿜칠재가 보이면 "
    "hazards 에 type=ASBESTOS_SUSPECT 를 포함한다."
)

_GENERATION_SYSTEM = (
    "너는 철거 공정·폐기물 처리 계획을 세우는 전문가다. 1패스 인식 결과와 제공된 안전지침 근거만을 "
    "바탕으로 JSON 으로만 답한다. process_steps 의 각 safety_guidelines 는 반드시 제공된 근거의 "
    "source_document(및 source_clause)를 인용한다. 근거에 없는 내용은 지어내지 않는다. "
    "석면 유무를 확정하는 표현은 절대 쓰지 않는다."
)


class VLLMPipeline:
    def __init__(
        self,
        model: str,
        model_version: str,
        base_url: str = "http://localhost:8000/v1",
        api_key: str = "",
        retriever=None,
        top_k: int = 3,
        timeout: float = 180.0,
    ) -> None:
        self._model = model
        self._model_version = model_version
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._retriever = retriever
        self._top_k = top_k
        self._timeout = timeout

    async def _chat(self, messages: list, schema: dict) -> dict:
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        payload = {
            "model": self._model,
            "messages": messages,
            "temperature": 0.2,
            # vLLM 구조화 디코딩 — 스키마 고정 출력.
            "extra_body": {"guided_json": schema},
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/chat/completions", headers=headers, json=payload
            )
            resp.raise_for_status()
            data = resp.json()
        return json.loads(data["choices"][0]["message"]["content"])

    @staticmethod
    def _image_content(photo_urls: List[str]) -> list:
        return [{"type": "image_url", "image_url": {"url": u}} for u in photo_urls]

    async def _pass1(self, request: JobCreateRequest) -> dict:
        schema = {
            "type": "object",
            "properties": {
                "site_summary": SiteSummary.model_json_schema(),
                "materials": {"type": "array", "items": {"type": "object"}},
                "hazards": {"type": "array", "items": {"type": "object"}},
            },
            "required": ["site_summary", "materials", "hazards"],
        }
        user_content = [
            {
                "type": "text",
                "text": "다음 사진들을 분석해 site_summary/materials/hazards 를 채워라. "
                f"부가정보: {json.dumps(request.input_meta, ensure_ascii=False)}",
            },
            *self._image_content(request.photo_urls),
        ]
        return await self._chat(
            [
                {"role": "system", "content": _RECOGNITION_SYSTEM},
                {"role": "user", "content": user_content},
            ],
            schema,
        )

    async def _pass2(self, recognition: dict, request: JobCreateRequest, guidelines: list) -> dict:
        schema = {
            "type": "object",
            "properties": {
                "process_steps": {"type": "array", "items": {"type": "object"}},
                "waste_plan": WastePlan.model_json_schema(),
            },
            "required": ["process_steps", "waste_plan"],
        }
        evidence = [
            {"source_document": g.source, "source_clause": g.clause, "text": g.body}
            for g in guidelines
        ]
        prompt = (
            "1패스 인식 결과:\n"
            + json.dumps(recognition, ensure_ascii=False)
            + "\n\n부가정보:\n"
            + json.dumps(request.input_meta, ensure_ascii=False)
            + "\n\n인용 가능한 안전지침 근거(이 안에서만 인용):\n"
            + json.dumps(evidence, ensure_ascii=False)
            + "\n\nprocess_steps 와 waste_plan 을 생성하라."
        )
        return await self._chat(
            [
                {"role": "system", "content": _GENERATION_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            schema,
        )

    def _retrieve(self, recognition: dict) -> list:
        if self._retriever is None:
            return []
        mats = ", ".join(m.get("category", "") for m in recognition.get("materials", []))
        hz = ", ".join(h.get("type", "") for h in recognition.get("hazards", []))
        query = f"철거 해체 안전 지침 {mats} {hz}".strip()
        return self._retriever.search(query, top_k=self._top_k)

    async def analyze(
        self, request: JobCreateRequest, on_stage: StageCallback
    ) -> VisionReport:
        await on_stage(JobStage.RECOGNITION)
        recognition = await self._pass1(request)

        await on_stage(JobStage.GUIDELINE_SEARCH)
        guidelines = self._retrieve(recognition)

        await on_stage(JobStage.PROCESS_GENERATION)
        generation = await self._pass2(recognition, request, guidelines)

        report = VisionReport(
            site_summary=SiteSummary(**recognition["site_summary"]),
            materials=recognition.get("materials", []),
            hazards=[HazardItem(**h) for h in recognition.get("hazards", [])],
            process_steps=[ProcessStep(**s) for s in generation.get("process_steps", [])],
            waste_plan=WastePlan(**generation["waste_plan"]),
            disclaimer=REPORT_DISCLAIMER,
            model_version=self._model_version,
            analyzed_at=datetime.now(timezone.utc).isoformat(),
        )
        return self._enforce_safety(report)

    @staticmethod
    def _enforce_safety(report: VisionReport) -> VisionReport:
        """안전 후처리(§7.1). 최종 방어선은 worker 의 validate_report."""
        # 고지 고정.
        report.disclaimer = REPORT_DISCLAIMER
        # 석면 의심 hazard 에 전문 조사 안내 보강.
        for h in report.hazards:
            if h.type == "ASBESTOS_SUSPECT" and ASBESTOS_SUSPECT_GUIDANCE not in h.guidance:
                h.guidance = (h.guidance + " " + ASBESTOS_SUSPECT_GUIDANCE).strip()
        # 올바로 의무 대상 판정을 폐기물 총량(톤)으로 재계산해 덮어쓴다.
        total_ton = 0.0
        for w in report.waste_plan.items:
            if w.estimated_amount.unit == "ton":
                total_ton += (w.estimated_amount.value_min + w.estimated_amount.value_max) / 2
        required = is_allbaro_manifest_required(total_ton)
        report.waste_plan.allbaro_manifest_required = required
        report.waste_plan.allbaro_reason = (
            f"건설폐기물 예상 총량 약 {total_ton:.1f}톤 — 5톤 이상 의무 대상"
            if required
            else f"건설폐기물 예상 총량 약 {total_ton:.1f}톤 — 5톤 미만, 의무 대상 아님"
        )
        return report
