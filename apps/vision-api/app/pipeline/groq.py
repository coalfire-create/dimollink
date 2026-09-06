"""Groq 2-패스 파이프라인 — GPU 없이 도는 실추론 경로.

`vllm.py` 와 **같은 계약**(VisionReport)을 내되 모델만 Groq 클라우드로 바꾼다.
파이프라인·안전 후처리·물량 계산·RAG 인용 강제는 전부 공유하므로, 갈아끼워도
리포트의 성질이 달라지지 않는다.

왜 필요한가:
- 자체 파인튜닝 어댑터(recognition-ground-v2)는 vLLM 자체 서빙에서만 돈다.
  Groq 는 커스텀 모델 업로드를 지원하지 않는다.
- 그래서 **상시 데모는 Groq(무료 티어), 정확도 근거는 자체 모델**로 나눈다.
  같은 파이프라인에 모델만 바꿔 끼운 것이라 A/B 비교가 성립한다.

⚠️ 범용 모델은 파인튜닝 모델보다 자재 인식이 부정확하다. 그래도 리포트가 위험해지지는
않는다 — 물량은 사진이 아니라 연면적 원단위가 계산하고([[quantity]]), 석면 확정 표현은
검증 레이어가 막고, 근거 없는 안전지침은 후처리가 삭제한다.
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
from ..quantity import build_waste_plan, estimation_structure
from ..taxonomy import (
    ASBESTOS_SUSPECT_GUIDANCE,
    MATERIAL_CODES,
    REPORT_DISCLAIMER,
    is_allbaro_manifest_required,
)
from .base import StageCallback
from .vllm import enrich_recognition

# 1패스(인식) — 자재 코드만 뽑는다. vLLM 어댑터와 같은 출력 계약이라 이후 단계가 공용이다.
_RECOGNITION_SYSTEM = (
    "너는 한국 철거현장 자재 인식기다. 사진에 실제로 보이는 해체 자재만 12종 코드로 답한다. "
    "보이지 않는 것을 추측해 넣지 마라. "
    'JSON {"materials":[코드,...]} 형식으로만 답한다. '
    "석면 의심(ROOFING_SLATE)은 '확정'이 아니라 '의심'으로만 다룬다."
)

_RECOGNITION_SCHEMA = {
    "type": "object",
    "properties": {
        "materials": {"type": "array", "items": {"type": "string", "enum": MATERIAL_CODES}},
    },
    "required": ["materials"],
}

_GENERATION_SYSTEM = (
    "너는 철거 공정·폐기물 처리 계획을 세우는 전문가다. 1패스 인식 결과와 제공된 안전지침 "
    "근거만을 바탕으로 JSON 으로만 답한다. process_steps 의 각 safety_guidelines 는 반드시 "
    "제공된 근거의 source_document(및 source_clause)를 그대로 인용한다. 근거에 없는 내용은 "
    "지어내지 않는다. 물량(톤·㎥)은 추정하지 마라 — 서버가 연면적으로 계산해 덮어쓴다. "
    "석면 유무를 확정하는 표현은 절대 쓰지 않는다. 모든 텍스트는 한국어로 쓴다."
)


class GroqError(RuntimeError):
    """Groq 호출 실패. 재시도해도 소용없는 경우(레이트리밋·인증)를 구분한다."""

    def __init__(self, status: int, body: str, retry_after: Optional[str] = None) -> None:
        self.status = status
        self.body = body
        self.retry_after = retry_after
        super().__init__(f"Groq {status}: {body}")

    @property
    def retryable(self) -> bool:
        """즉시 재시도가 의미 있는가.

        429(레이트리밋)·401/403(인증)은 곧바로 다시 걸어도 같은 결과이고, 429 는
        오히려 한도를 더 소진시킨다. 일시적 서버 오류(5xx)만 재시도한다.
        """
        return self.status >= 500


class GroqPipeline:
    """Groq OpenAI 호환 chat/completions 로 2패스를 수행한다."""

    def __init__(
        self,
        model: str,
        model_version: str,
        api_key: str,
        base_url: str = "https://api.groq.com/openai/v1",
        retriever=None,
        top_k: int = 3,
        timeout: float = 120.0,
        max_images: int = 5,
        max_tokens_recognition: int = 256,
        max_tokens_generation: int = 900,
    ) -> None:
        self._model = model
        self._model_version = model_version
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._retriever = retriever
        self._top_k = top_k
        self._timeout = timeout
        self._max_images = max_images
        self._max_tokens_recognition = max_tokens_recognition
        self._max_tokens_generation = max_tokens_generation

    async def _chat(self, messages: list, *, json_object: bool = True, max_tokens: int = 900) -> dict:
        payload = {
            "model": self._model,
            "messages": messages,
            "temperature": 0,
            # qwen3 계열은 추론(<think>) 모델이라 끄지 않으면 JSON 앞에 사고 과정이 붙는다.
            "reasoning_effort": "none",
            # ⚠️ Groq 무료 티어는 분당 출력 토큰(OTPM)이 1000 이다. 이보다 크게 요청하면
            # 실제 출력이 짧아도 429 로 거부된다 — 단계별로 필요한 만큼만 잡는다.
            "max_tokens": max_tokens,
        }
        if json_object:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self._api_key}",
                },
                json=payload,
            )
            if resp.status_code >= 400:
                # 상태코드만으로는 어떤 한도인지 알 수 없다. Groq 는 본문에 사유와
                # 재시도 시점을 담아 보내므로 그대로 올려 진단이 가능하게 한다.
                raise GroqError(resp.status_code, resp.text[:500], resp.headers.get("retry-after"))
            data = resp.json()
        return _parse_json(data["choices"][0]["message"]["content"])

    def _image_content(self, photo_urls: List[str]) -> list:
        """사진을 요청에 싣는다. data: URI(base64)도 그대로 통한다 — 별도 저장소가 필요 없다.

        상한을 두는 이유: 40장을 base64 로 한 요청에 실으면 수십 MB 가 되어 거부된다.
        인식에는 대표 장수면 충분하고, 놓친 부위는 결측으로 선언된다.
        """
        return [
            {"type": "image_url", "image_url": {"url": u}}
            for u in photo_urls[: self._max_images]
        ]

    async def _pass1(self, request: JobCreateRequest) -> dict:
        """사진 → 자재 코드 → 리포트 1패스 계약(vLLM 과 동일 형태로 보강)."""
        content = [
            {"type": "text", "text": _recognition_prompt(request.input_meta)},
            *self._image_content(request.photo_urls),
        ]
        result = await self._chat(
            [
                {"role": "system", "content": _RECOGNITION_SYSTEM},
                {"role": "user", "content": content},
            ],
            max_tokens=self._max_tokens_recognition,
        )
        codes = result.get("materials", []) if isinstance(result, dict) else []
        return enrich_recognition(codes, request.input_meta)

    async def _pass2(self, recognition: dict, request: JobCreateRequest, guidelines: list) -> dict:
        evidence = [
            {"source_document": g.source, "source_clause": g.clause, "text": g.body}
            for g in guidelines
        ]
        prompt = (
            "1패스 인식 결과:\n"
            + json.dumps(recognition, ensure_ascii=False)
            + "\n\n부가정보(건축물대장 확인 사실 포함):\n"
            + json.dumps(request.input_meta, ensure_ascii=False)
            + "\n\n인용 가능한 안전지침 근거(이 안에서만 인용):\n"
            + json.dumps(evidence, ensure_ascii=False)
            + '\n\n{"process_steps":[{"order":1,"task_name":"","sub_tasks":[],'
            '"required_equipment":[],"required_workforce":"","estimated_duration":"",'
            '"safety_guidelines":[{"text":"","source_document":"","source_clause":""}]}],'
            '"waste_plan":{"items":[],"allbaro_manifest_required":false,"allbaro_reason":""}}'
            " 형태로만 답하라."
        )
        return await self._chat(
            [
                {"role": "system", "content": _GENERATION_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            max_tokens=self._max_tokens_generation,
        )

    def _retrieve(self, recognition: dict) -> list:
        if self._retriever is None:
            return []
        mats = ", ".join(m.get("category", "") for m in recognition.get("materials", []))
        hz = ", ".join(h.get("type", "") for h in recognition.get("hazards", []))
        return self._retriever.search(f"철거 해체 안전 지침 {mats} {hz}".strip(), top_k=self._top_k)

    async def analyze(
        self, request: JobCreateRequest, on_stage: StageCallback
    ) -> VisionReport:
        await on_stage(JobStage.RECOGNITION)
        recognition = await self._pass1(request)

        await on_stage(JobStage.GUIDELINE_SEARCH)
        guidelines = self._retrieve(recognition)
        allowed_sources = {g.source for g in guidelines}

        await on_stage(JobStage.PROCESS_GENERATION)
        generation = await self._pass2(recognition, request, guidelines)

        # 물량은 계산이 정답이다 — 생성이 지어낸 waste_plan 수치를 덮어쓴다.
        computed_plan = build_waste_plan(
            [m["category"] for m in recognition.get("materials", [])],
            estimation_structure(recognition["site_summary"].get("structure"), request.input_meta),
            request.input_meta,
        )
        if computed_plan is not None:
            generation["waste_plan"] = computed_plan

        report = VisionReport(
            site_summary=SiteSummary(**recognition["site_summary"]),
            materials=recognition.get("materials", []),
            hazards=[HazardItem(**h) for h in recognition.get("hazards", [])],
            process_steps=[
                ProcessStep(**s) for s in _valid_steps(generation.get("process_steps", []))
            ],
            waste_plan=WastePlan(**generation["waste_plan"]),
            disclaimer=REPORT_DISCLAIMER,
            model_version=self._model_version,
            analyzed_at=datetime.now(timezone.utc).isoformat(),
        )
        return _enforce_safety(report, allowed_sources)


def _recognition_prompt(input_meta: dict) -> str:
    """인식 지시문. 건축물대장 사실이 있으면 오인식을 막는 근거로 앞세운다."""
    base = "이 철거 현장 사진들에서 보이는 해체 자재를 12종 코드로 골라라."
    facts = input_meta.get("ledger_facts")
    if isinstance(facts, str) and facts.strip():
        # 대장은 사진 판독보다 신뢰도가 높은 확정 정보다 — 어긋나면 대장을 따르게 한다.
        base += (
            f"\n\n[건축물대장 확인 사실] {facts.strip()}\n"
            "이 값들은 사진보다 신뢰도가 높은 확정 정보다. 사진 판독이 이와 어긋나면 "
            "대장을 우선해 자재를 바로잡아라."
        )
    return base


def _valid_steps(steps: list) -> list:
    """생성 결과에서 스키마를 못 맞춘 단계는 버린다(리포트 전체를 실패시키지 않는다)."""
    out = []
    for i, s in enumerate(steps):
        if not isinstance(s, dict) or not s.get("task_name"):
            continue
        s.setdefault("order", i + 1)
        s.setdefault("sub_tasks", [])
        s.setdefault("required_equipment", [])
        s.setdefault("required_workforce", "현장 판단")
        s.setdefault("estimated_duration", "현장 판단")
        s.setdefault("safety_guidelines", [])
        out.append(s)
    return out


def _enforce_safety(report: VisionReport, allowed_sources: set) -> VisionReport:
    """안전 후처리(§7.1) — vllm.py 와 동일 규칙. 최종 방어선은 worker 의 validate_report."""
    report.disclaimer = REPORT_DISCLAIMER

    for h in report.hazards:
        if h.type == "ASBESTOS_SUSPECT" and ASBESTOS_SUSPECT_GUIDANCE not in h.guidance:
            h.guidance = (h.guidance + " " + ASBESTOS_SUSPECT_GUIDANCE).strip()

    # 인용 강제 — 검색된 근거에 없는 출처를 단 안전지침은 버린다.
    for step in report.process_steps:
        step.safety_guidelines = [
            g
            for g in step.safety_guidelines
            if g.source_document and g.source_document in allowed_sources
        ]

    total_ton = sum(
        (w.estimated_amount.value_min + w.estimated_amount.value_max) / 2
        for w in report.waste_plan.items
        if w.estimated_amount.unit == "ton"
    )
    required = is_allbaro_manifest_required(total_ton)
    report.waste_plan.allbaro_manifest_required = required
    report.waste_plan.allbaro_reason = (
        f"건설폐기물 예상 총량 약 {total_ton:.1f}톤 — 5톤 이상 의무 대상"
        if required
        else f"건설폐기물 예상 총량 약 {total_ton:.1f}톤 — 5톤 미만, 의무 대상 아님"
    )
    return report


def _parse_json(text: str) -> dict:
    """모델 응답에서 JSON 객체를 뽑는다. 코드블록·앞뒤 설명이 붙어도 살려낸다."""
    if not text:
        return {}
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return {}
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return {}
