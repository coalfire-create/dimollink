"""Groq 파이프라인 — GPU 없이 도는 실추론 경로.

vLLM 경로와 **같은 계약**을 내는지, 그리고 안전 후처리·물량 계산·대장 주입이
모델을 바꿔도 그대로 걸리는지 확인한다. 범용 모델은 자재 인식이 덜 정확해도
리포트가 위험해지면 안 된다.
"""

from __future__ import annotations

import asyncio

from app.pipeline.groq import GroqPipeline, _parse_json, _recognition_prompt, _valid_steps
from app.schemas import JobCreateRequest
from app.validation import validate_report


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


class _Chunk:
    def __init__(self, source, clause, body):
        self.source, self.clause, self.body, self.score = source, clause, body, 1.0


class _Retriever:
    def __init__(self, chunks):
        self._chunks = chunks

    def search(self, query, top_k=3):
        return self._chunks


def _pipe(monkeypatch, generation, materials=None, retriever=None):
    pipe = GroqPipeline(
        model="qwen/qwen3.6-27b", model_version="groq-test", api_key="k",
        retriever=retriever,
    )
    seen = {}

    async def fake_chat(messages, json_object=True):
        seen["last_system"] = messages[0]["content"]
        seen.setdefault("user", []).append(messages[1]["content"])
        if "자재 인식기" in messages[0]["content"]:
            return {"materials": materials if materials is not None else ["ROOFING_SLATE", "WOOD"]}
        return generation

    monkeypatch.setattr(pipe, "_chat", fake_chat)
    return pipe, seen


_GOOD_GENERATION = {
    "process_steps": [
        {
            "order": 1, "task_name": "지붕 슬레이트 해체", "sub_tasks": ["습식 살수"],
            "required_equipment": ["보호구"], "required_workforce": "2인",
            "estimated_duration": "1일",
            "safety_guidelines": [
                {"text": "상부에서 하부로 해체한다",
                 "source_document": "KOSHA 해체공사 안전보건작업 지침", "source_clause": "제5조"},
                {"text": "지어낸 지침", "source_document": "존재하지 않는 고시"},
            ],
        }
    ],
    "waste_plan": {"items": [], "allbaro_manifest_required": False, "allbaro_reason": "미정"},
}


def test_produces_same_contract_as_vllm(monkeypatch):
    retriever = _Retriever([_Chunk("KOSHA 해체공사 안전보건작업 지침", "제5조", "본문")])
    pipe, _ = _pipe(monkeypatch, _GOOD_GENERATION, retriever=retriever)

    async def on_stage(stage):
        return None

    report = _run(pipe.analyze(JobCreateRequest(photo_urls=["https://x/a.jpg"]), on_stage))

    assert [m.category for m in report.materials] == ["ROOFING_SLATE", "WOOD"]
    # 석면 의심 자재 → hazards 자동 유도 + 전문 조사 안내 강제(§7.1)
    asb = next(h for h in report.hazards if h.type == "ASBESTOS_SUSPECT")
    assert "전문 조사기관" in asb.guidance
    # 최종 검증 레이어 통과
    assert validate_report(report) == []


def test_unsourced_guideline_is_dropped(monkeypatch):
    """근거에 없는 출처를 단 안전지침은 버린다 — 모델이 바뀌어도 규칙은 같다."""
    retriever = _Retriever([_Chunk("KOSHA 해체공사 안전보건작업 지침", "제5조", "본문")])
    pipe, _ = _pipe(monkeypatch, _GOOD_GENERATION, retriever=retriever)

    async def on_stage(stage):
        return None

    report = _run(pipe.analyze(JobCreateRequest(photo_urls=["https://x/a.jpg"]), on_stage))
    guidelines = report.process_steps[0].safety_guidelines
    assert len(guidelines) == 1
    assert guidelines[0].source_document == "KOSHA 해체공사 안전보건작업 지침"


def test_computed_quantity_overrides_generation(monkeypatch):
    """연면적을 알면 물량은 계산이 이긴다 — 올바로 판정이 환각에 좌우되면 안 된다."""
    pipe, _ = _pipe(monkeypatch, _GOOD_GENERATION, materials=["REINFORCED_CONCRETE"])

    async def on_stage(stage):
        return None

    req = JobCreateRequest(photo_urls=["https://x/a.jpg"], input_meta={"floor_area": "100"})
    report = _run(pipe.analyze(req, on_stage))

    total = sum((i.estimated_amount.value_min + i.estimated_amount.value_max) / 2
                for i in report.waste_plan.items)
    assert total > 100  # 100㎡ RC → 158톤 근처
    assert report.waste_plan.allbaro_manifest_required is True


def test_ledger_facts_are_injected_into_recognition(monkeypatch):
    """디몰링크가 조회한 건축물대장 사실을 인식 프롬프트에 사실로 넣는다."""
    pipe, seen = _pipe(monkeypatch, _GOOD_GENERATION)

    async def on_stage(stage):
        return None

    req = JobCreateRequest(
        photo_urls=["https://x/a.jpg"],
        input_meta={"ledger_facts": "주구조 철근콘크리트구조, 사용승인 2015년"},
    )
    _run(pipe.analyze(req, on_stage))

    first_user = seen["user"][0]
    text = first_user[0]["text"] if isinstance(first_user, list) else first_user
    assert "건축물대장 확인 사실" in text
    assert "철근콘크리트구조" in text
    assert "대장을 우선" in text


def test_recognition_prompt_without_ledger_stays_plain():
    prompt = _recognition_prompt({})
    assert "건축물대장" not in prompt
    assert "12종" in prompt


def test_invalid_steps_are_dropped_not_fatal():
    """스키마를 못 맞춘 단계는 버리되 리포트 전체를 실패시키지 않는다."""
    steps = _valid_steps([
        {"task_name": "정상"},
        {"task_name": ""},          # 이름 없음 → 버림
        "문자열",                     # dict 아님 → 버림
    ])
    assert len(steps) == 1
    assert steps[0]["order"] == 1
    assert steps[0]["required_workforce"]  # 기본값이 채워진다


def test_parse_json_survives_wrapping():
    """코드블록·앞뒤 설명이 붙어도 JSON 을 살려낸다."""
    assert _parse_json('```json\n{"materials":["WOOD"]}\n```') == {"materials": ["WOOD"]}
    assert _parse_json('설명\n{"a":1}\n끝') == {"a": 1}
    assert _parse_json("") == {}
    assert _parse_json("JSON 아님") == {}


# ── 오류 처리: 재시도해도 소용없는 실패를 구분한다 ──────────────────────────

def test_rate_limit_is_not_retryable():
    """429 를 즉시 재시도하면 한도만 더 깎는다 — 재시도 대상이 아니다."""
    from app.pipeline.groq import GroqError
    from app.worker import _is_retryable

    err = GroqError(429, '{"error":{"message":"rate limit"}}', retry_after="60")
    assert err.retryable is False
    assert _is_retryable(err) is False
    # 진단에 필요한 정보가 메시지에 남아야 한다.
    assert "429" in str(err) and "rate limit" in str(err)
    assert err.retry_after == "60"


def test_auth_error_is_not_retryable():
    from app.pipeline.groq import GroqError
    from app.worker import _is_retryable

    assert _is_retryable(GroqError(401, "invalid api key")) is False


def test_server_error_is_retryable():
    """일시적 서버 오류는 재시도할 값어치가 있다."""
    from app.pipeline.groq import GroqError
    from app.worker import _is_retryable

    assert GroqError(503, "upstream").retryable is True
    assert _is_retryable(GroqError(503, "upstream")) is True


def test_unknown_errors_stay_retryable():
    """판단을 노출하지 않는 예외는 기존대로 재시도한다(동작을 바꾸지 않는다)."""
    from app.worker import _is_retryable

    assert _is_retryable(RuntimeError("네트워크 끊김")) is True
