"""학습된 인식 어댑터 ↔ 앱 파이프라인 연결 검증 (기획서 §3.3, §7.1).

학습 모델은 image → {"materials":[코드]} 만 내놓는다. 파이프라인이 이 계약을 그대로 쓰고,
코드 목록을 리포트 스키마로 보강(석면 hazard 자동 유도)한 뒤 2패스·검증·프리필로 흐르는지 확인한다.
GPU/vLLM 없이 _chat 을 목킹해 배선을 검증한다.
"""

from __future__ import annotations

import asyncio

from app.pipeline.vllm import VLLMPipeline, enrich_recognition
from app.schemas import JobCreateRequest
from app.validation import validate_report


def test_enrich_derives_asbestos_hazard_from_slate():
    enr = enrich_recognition(["BRICK_MASONRY", "ROOFING_SLATE", "ROOFING_SLATE"], {"building_use": "주택"})
    cats = [m["category"] for m in enr["materials"]]
    assert cats == ["BRICK_MASONRY", "ROOFING_SLATE"]  # 중복 제거, 순서 유지
    assert enr["site_summary"]["structure"] == "MASONRY"
    assert enr["site_summary"]["building_type"] == "주택"
    # 석면 의심 자재 → hazards 자동 유도(§7.1)
    hz = [h for h in enr["hazards"] if h["type"] == "ASBESTOS_SUSPECT"]
    assert len(hz) == 1 and "의심" in hz[0]["description"]


def test_enrich_ignores_unknown_codes_and_defaults_structure():
    enr = enrich_recognition(["NOT_A_CODE", "GLASS"], {})
    assert [m["category"] for m in enr["materials"]] == ["GLASS"]
    assert enr["site_summary"]["structure"] == "UNKNOWN"
    assert enr["hazards"] == []


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_analyze_wires_trained_recognition_to_report(monkeypatch):
    pipe = VLLMPipeline(model="Qwen/Qwen3-VL-8B-Instruct",
                        model_version="Qwen/Qwen3-VL-8B-Instruct+ground-v1",
                        lora="recognition-ground-v1", retriever=None)

    # LoRA 어댑터 이름이 서빙 model 로 쓰이는지
    assert pipe._serve_model == "recognition-ground-v1"

    async def fake_chat(messages, schema):
        sys = messages[0]["content"]
        if "자재 인식기" in sys:  # 1패스: 학습 계약(코드 목록)
            return {"materials": ["ROOFING_SLATE", "WOOD"]}
        # 2패스: 공정/폐기물 (슬레이트 6톤 → 올바로 대상)
        return {
            "process_steps": [{
                "order": 1, "task_name": "지붕 슬레이트 해체", "sub_tasks": [],
                "required_equipment": [], "required_workforce": "2인", "estimated_duration": "1일",
                "safety_guidelines": [],
            }],
            "waste_plan": {
                "items": [{"category": "ROOFING_SLATE",
                           "estimated_amount": {"value_min": 6.0, "value_max": 6.0, "unit": "ton"},
                           "disposal_method": "지정폐기물"}],
                "allbaro_manifest_required": False, "allbaro_reason": "미정",
            },
        }

    monkeypatch.setattr(pipe, "_chat", fake_chat)

    async def on_stage(stage):
        return None

    req = JobCreateRequest(photo_urls=["https://x/a.jpg"], input_meta={"building_use": "주택"})
    report = _run(pipe.analyze(req, on_stage))

    # 학습 인식 → 자재/석면 hazard 반영
    assert [m.category for m in report.materials] == ["ROOFING_SLATE", "WOOD"]
    assert any(h.type == "ASBESTOS_SUSPECT" for h in report.hazards)
    # 안전 후처리: 석면 안내 문구 강제
    asb = next(h for h in report.hazards if h.type == "ASBESTOS_SUSPECT")
    assert "전문 조사기관" in asb.guidance
    # 올바로: 폐기물 6톤 → 의무 대상 재계산(§7.1)
    assert report.waste_plan.allbaro_manifest_required is True
    assert "5톤 이상" in report.waste_plan.allbaro_reason
    # 최종 방어선(worker) 검증 통과 — 석면 확정표현 없음
    assert validate_report(report) == []


def test_computed_quantity_overrides_hallucinated_waste_plan(monkeypatch):
    """연면적을 알면 2패스가 지어낸 물량을 계산값으로 덮어쓴다.

    이 수치로 올바로 의무신고(5톤) 여부까지 판정되므로 환각을 남겨둘 수 없다.
    """
    pipe = VLLMPipeline(model="Qwen/Qwen3-VL-8B-Instruct",
                        model_version="test", lora="", retriever=None)

    async def fake_chat(messages, schema):
        sys = messages[0]["content"]
        if "자재 인식기" in sys:
            return {"materials": ["ROOFING_SLATE", "WOOD"]}
        # 2패스가 슬레이트 0.2톤 하나만 있다고 우겨도(환각) 계산이 이긴다.
        return {
            "process_steps": [],
            "waste_plan": {
                "items": [{"category": "ROOFING_SLATE",
                           "estimated_amount": {"value_min": 0.2, "value_max": 0.2, "unit": "ton"},
                           "disposal_method": "아무거나"}],
                "allbaro_manifest_required": False, "allbaro_reason": "미정",
            },
        }

    monkeypatch.setattr(pipe, "_chat", fake_chat)

    async def on_stage(stage):
        return None

    # 목조 100㎡ → 100 × 1.58 × 0.33 ≈ 52톤
    req = JobCreateRequest(photo_urls=["https://x/a.jpg"],
                           input_meta={"building_use": "주택", "floor_area": "100"})
    report = _run(pipe.analyze(req, on_stage))

    cats = [i.category for i in report.waste_plan.items]
    # 사진에 안 보인 기초 콘크리트도 구조상 포함된다.
    assert "PLAIN_CONCRETE" in cats
    assert "WOOD" in cats and "ROOFING_SLATE" in cats
    # 환각 수치(0.2톤)가 아니라 계산 총량(약 52톤)이 반영된다.
    total = sum((i.estimated_amount.value_min + i.estimated_amount.value_max) / 2
                for i in report.waste_plan.items)
    assert 45 < total < 60
    # → 올바로 의무 대상(5톤 이상)으로 뒤집힌다.
    assert report.waste_plan.allbaro_manifest_required is True
    # 1패스 materials 의 물량도 0 이 아니라 계산값으로 채워진다.
    assert all(m.quantity_estimate.value_max > 0 for m in report.materials)
    assert validate_report(report) == []


def test_quantity_stays_unknown_without_floor_area(monkeypatch):
    """연면적을 모르면 물량은 0 범위로 남긴다 — 수치를 지어내지 않는다."""
    pipe = VLLMPipeline(model="m", model_version="test", lora="", retriever=None)

    async def fake_chat(messages, schema):
        if "자재 인식기" in messages[0]["content"]:
            return {"materials": ["REINFORCED_CONCRETE"]}
        return {"process_steps": [], "waste_plan": {
            "items": [], "allbaro_manifest_required": False, "allbaro_reason": "미정"}}

    monkeypatch.setattr(pipe, "_chat", fake_chat)

    async def on_stage(stage):
        return None

    req = JobCreateRequest(photo_urls=["https://x/a.jpg"], input_meta={})
    report = _run(pipe.analyze(req, on_stage))
    assert all(m.quantity_estimate.value_max == 0 for m in report.materials)


class _StubChunk:
    """RetrievedChunk 대역 — 검색된 근거 1건."""

    def __init__(self, source: str, clause: str, body: str) -> None:
        self.source, self.clause, self.body, self.score = source, clause, body, 1.0


class _StubRetriever:
    def __init__(self, chunks):
        self._chunks = chunks

    def search(self, query, top_k=3):
        return self._chunks


def _pipe_with_guidelines(monkeypatch, guidelines_out):
    """2패스가 주어진 safety_guidelines 를 내놓도록 고정한 파이프라인."""
    pipe = VLLMPipeline(
        model="m",
        model_version="test",
        lora="",
        retriever=_StubRetriever([_StubChunk("KOSHA 해체공사 안전보건작업 지침", "제5조", "본문")]),
    )

    async def fake_chat(messages, schema):
        if "자재 인식기" in messages[0]["content"]:
            return {"materials": ["REINFORCED_CONCRETE"]}
        return {
            "process_steps": [
                {
                    "order": 1, "task_name": "구조체 해체", "sub_tasks": [],
                    "required_equipment": [], "required_workforce": "3인",
                    "estimated_duration": "2일", "safety_guidelines": guidelines_out,
                }
            ],
            "waste_plan": {"items": [], "allbaro_manifest_required": False, "allbaro_reason": "미정"},
        }

    monkeypatch.setattr(pipe, "_chat", fake_chat)
    return pipe


def test_unsourced_safety_guideline_is_dropped(monkeypatch):
    """검색된 근거에 없는 출처를 단 안전지침은 버린다.

    프롬프트로 "근거만 인용하라"고 시켜도 모델은 그럴듯한 출처를 지어낸다.
    가짜 근거가 붙은 안전지침은 지침이 아예 없는 것보다 나쁘다.
    """
    pipe = _pipe_with_guidelines(
        monkeypatch,
        [
            {"text": "상부에서 하부로 해체한다", "source_document": "KOSHA 해체공사 안전보건작업 지침",
             "source_clause": "제5조"},
            {"text": "지어낸 지침", "source_document": "존재하지 않는 고시 제99조"},
            {"text": "출처 없는 지침", "source_document": ""},
        ],
    )

    async def on_stage(stage):
        return None

    report = _run(pipe.analyze(JobCreateRequest(photo_urls=["https://x/a.jpg"]), on_stage))

    guidelines = report.process_steps[0].safety_guidelines
    assert len(guidelines) == 1
    assert guidelines[0].source_document == "KOSHA 해체공사 안전보건작업 지침"
    # 검증 레이어도 통과해야 한다(출처 없는 지침이 남아 있으면 실패한다).
    assert validate_report(report) == []


def test_step_survives_even_if_all_guidelines_dropped(monkeypatch):
    """근거 없는 지침만 있었어도 공정 단계 자체는 남긴다(공정 정보는 유효)."""
    pipe = _pipe_with_guidelines(
        monkeypatch, [{"text": "지어낸 지침", "source_document": "가짜 문서"}]
    )

    async def on_stage(stage):
        return None

    report = _run(pipe.analyze(JobCreateRequest(photo_urls=["https://x/a.jpg"]), on_stage))
    assert len(report.process_steps) == 1
    assert report.process_steps[0].safety_guidelines == []
    assert validate_report(report) == []
