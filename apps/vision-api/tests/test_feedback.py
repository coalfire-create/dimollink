"""피드백 → 학습 예시 변환 테스트 (기획서 §V5)."""

from app.feedback import FeedbackRecord, build_training_examples, export_jsonl, load_feedback_jsonl

FULL = {
    "site_summary": {"building_type": "주택"},
    "materials": [{"category": "BRICK_MASONRY"}],
    "hazards": [{"type": "ASBESTOS_SUSPECT"}],
    "process_steps": [{"order": 1}],
    "waste_plan": {"allbaro_manifest_required": True},
}


def _rec(**kw):
    base = dict(analysis_id="a", image_paths=["p1"], input_meta={}, model_result=FULL)
    base.update(kw)
    return FeedbackRecord(**base)


def test_correction_produces_two_task_examples():
    ex = build_training_examples([_rec(corrected_result=FULL, rating=2)])
    tasks = {e["task"] for e in ex}
    assert tasks == {"recognition", "generation"}
    assert all(e["label_source"] == "correction" for e in ex)


def test_high_rating_accepts_model_output():
    ex = build_training_examples([_rec(rating=5)])
    assert len(ex) == 2
    assert all(e["label_source"] == "accepted" for e in ex)


def test_low_rating_without_correction_skipped():
    assert build_training_examples([_rec(rating=2)]) == []


def test_recognition_target_fields_only():
    ex = build_training_examples([_rec(rating=5)])
    rec = next(e for e in ex if e["task"] == "recognition")
    assert set(rec["target"]) <= {"site_summary", "materials", "hazards"}
    assert "process_steps" not in rec["target"]


def test_export_and_reload_roundtrip(tmp_path):
    ex = build_training_examples([_rec(corrected_result=FULL)])
    out = tmp_path / "train.jsonl"
    n = export_jsonl(ex, str(out))
    assert n == 2

    # 저장 포맷을 피드백 로더로 다시 읽는 게 아니라, 피드백 원천 로더 왕복 확인
    fb = tmp_path / "fb.jsonl"
    fb.write_text(
        '{"analysis_id":"a","image_paths":["p"],"model_result":' + '{}' + ',"corrected_result":' + '{"materials":[]}' + ',"rating":3}\n',
        encoding="utf-8",
    )
    recs = load_feedback_jsonl(str(fb))
    assert recs[0].analysis_id == "a"
    assert recs[0].corrected_result == {"materials": []}
