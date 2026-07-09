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
