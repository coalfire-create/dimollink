"""실 피드백 저장소 → 플라이휠 입력 연결 테스트 (기획서 §V5).

Postgres 없이 검증: InMemoryFeedbackSource → dump → load 왕복이 플라이휠 입력과 호환되는지,
그리고 그 산출물이 build_training_examples 로 실제 학습 예시가 되는지 확인.
"""

from __future__ import annotations

from app.feedback import (
    FeedbackRecord,
    InMemoryFeedbackSource,
    PgFeedbackSource,
    build_training_examples,
    dump_feedback_jsonl,
    export_feedback,
    load_feedback_jsonl,
)


def _records():
    return [
        FeedbackRecord(
            analysis_id="a1",
            image_paths=["u/1/roof.jpg", "u/1/wall.jpg"],
            input_meta={"year": 1990},
            model_result={"materials": ["WOOD"]},
            corrected_result={"materials": ["ROOFING_SLATE", "WOOD"], "hazards": ["ASBESTOS_SUSPECT"]},
            rating=2,
        ),
        FeedbackRecord(
            analysis_id="a2",
            image_paths=["u/2/x.jpg"],
            input_meta={},
            model_result={"materials": ["METAL"]},
            corrected_result=None,
            rating=5,  # 미교정이지만 고평점 → 채택
        ),
    ]


def test_dump_load_roundtrip_matches_flywheel_input(tmp_path):
    path = tmp_path / "feedback.jsonl"
    n = dump_feedback_jsonl(_records(), str(path))
    assert n == 2

    loaded = load_feedback_jsonl(str(path))
    assert [r.analysis_id for r in loaded] == ["a1", "a2"]
    assert loaded[0].image_paths == ["u/1/roof.jpg", "u/1/wall.jpg"]
    assert loaded[0].corrected_result["materials"] == ["ROOFING_SLATE", "WOOD"]
    assert loaded[1].rating == 5


def test_export_feedback_from_source(tmp_path):
    path = tmp_path / "feedback.jsonl"
    n = export_feedback(InMemoryFeedbackSource(_records()), str(path))
    assert n == 2
    # 내보낸 파일이 학습 예시로 변환되는지(교정 1건 + 고평점 1건 = recognition 예시 2건 이상)
    records = load_feedback_jsonl(str(path))
    examples = build_training_examples(records, min_rating_for_accept=4)
    rec_examples = [e for e in examples if e["task"] == "recognition"]
    assert len(rec_examples) == 2
    # a1 은 사람 교정 → label_source=correction
    a1 = next(e for e in rec_examples if e["analysis_id"] == "a1")
    assert a1["label_source"] == "correction"
    assert a1["target"]["materials"] == ["ROOFING_SLATE", "WOOD"]


def test_pg_source_requires_dsn():
    try:
        PgFeedbackSource("")
        assert False, "빈 DSN 은 거부돼야 함"
    except ValueError:
        pass


def test_since_filter_is_passed_through():
    """InMemory 는 since 를 무시하지만 시그니처 호환은 지켜야 한다(왕복 호환)."""
    src = InMemoryFeedbackSource(_records())
    assert len(src.fetch(since="2026-01-01")) == 2
