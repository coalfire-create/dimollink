"""플라이휠 재학습 루틴 테스트 (기획서 §V5). GPU 불필요 — dry-run 배선/게이트 검증."""

from __future__ import annotations

import json
import os

from app.flywheel import (
    feedback_to_recognition_rows,
    merge_training_data,
    run_cycle,
)

# train.py 가 기대하는 최소 config(dry-run 경로만 사용).
CONFIG = {
    "base_model": "Qwen/Qwen3-VL-8B-Instruct",
    "lora": {"r": 16, "alpha": 32, "dropout": 0.05, "target_modules": ["q_proj"]},
    "train": {"epochs": 1, "lr": 1e-4, "batch_size": 4, "seed": 42},
    "tasks": {"recognition": {}},
}


def _write_jsonl(path, rows):
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def test_feedback_to_recognition_rows_fans_out_images():
    examples = [
        {"task": "recognition", "images": ["a.jpg", "b.jpg"],
         "target": {"materials": ["WOOD"], "hazards": []}, "label_source": "correction"},
        {"task": "generation", "images": ["c.jpg"], "target": {"process_steps": []}},
        {"task": "recognition", "images": ["d.jpg"], "target": {"materials": []}},  # 라벨 없음 → 제외
    ]
    rows = feedback_to_recognition_rows(examples)
    assert len(rows) == 2  # a.jpg, b.jpg 만
    assert all(r["task"] == "recognition" and r["source"] == "feedback" for r in rows)
    assert {r["image"] for r in rows} == {"a.jpg", "b.jpg"}
    assert rows[0]["materials"] == ["WOOD"]


def test_merge_training_data_combines_base_and_feedback(tmp_path):
    base = tmp_path / "base.jsonl"
    _write_jsonl(base, [{"image": "x.jpg", "materials": ["METAL"], "task": "recognition"}])
    fb_rows = [{"image": "y.jpg", "materials": ["WOOD"], "task": "recognition", "source": "feedback"}]
    out = tmp_path / "merged.jsonl"
    stats = merge_training_data(str(base), fb_rows, str(out))
    assert stats == {"base": 1, "feedback": 1, "total": 2}
    assert out.exists()
    lines = out.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2


def test_merge_without_base_uses_feedback_only(tmp_path):
    out = tmp_path / "merged.jsonl"
    stats = merge_training_data(None, [{"image": "y.jpg", "materials": ["WOOD"], "task": "recognition"}], str(out))
    assert stats == {"base": 0, "feedback": 1, "total": 1}


def _base_train(tmp_path):
    base = tmp_path / "base_recognition.jsonl"
    _write_jsonl(base, [
        {"image": "1.jpg", "materials": ["REINFORCED_CONCRETE"], "task": "recognition"},
        {"image": "2.jpg", "materials": ["ROOFING_SLATE"], "task": "recognition"},
    ])
    return base


def _feedback(tmp_path):
    fb = tmp_path / "feedback.jsonl"
    _write_jsonl(fb, [
        {"analysis_id": "a1", "image_paths": ["fb1.jpg"], "input_meta": {},
         "model_result": {}, "corrected_result": {"materials": ["WOOD"], "hazards": []}},
    ])
    return fb


def test_run_cycle_dry_run_passes_gate_and_promotes(tmp_path):
    """샘플 평가셋은 게이트를 통과 → 어댑터 승격 + 배포 매니페스트 생성."""
    base = _base_train(tmp_path)
    fb = _feedback(tmp_path)
    evalset = "eval_samples/sample_evalset.jsonl"
    out = tmp_path / "runQ3"

    result = run_cycle(
        CONFIG, evalset_path=evalset, out_dir=str(out),
        feedback_path=str(fb), base_train_path=str(base),
    )

    assert result.dry_run is True
    # 병합: base 2 + 피드백 1(교정 → recognition row 1)
    assert result.dataset == {"base": 2, "feedback": 1, "total": 3}
    assert result.gate_passed is True
    assert result.promoted is True
    assert result.adapter_hash  # 대장 해시 존재

    # model_version.json: eval_passed 가 채워지고 status=candidate_promoted
    mv = json.loads((out / "adapter-recognition" / "model_version.json").read_text(encoding="utf-8"))
    assert mv["eval_passed"] is True
    assert mv["status"] == "candidate_promoted"

    # 배포 매니페스트가 생성됨(통과 시에만)
    assert result.deploy_manifest_path and os.path.exists(result.deploy_manifest_path)
    manifest = json.loads(open(result.deploy_manifest_path, encoding="utf-8").read())
    assert "vllm serve" in manifest["serve_command"]


def test_run_cycle_gate_fail_does_not_promote(tmp_path):
    """게이트 미달(석면 재현율 부족) → 승격 안 함, 매니페스트 없음, status=rejected."""
    base = _base_train(tmp_path)
    # 석면 정답인데 예측 실패 → 석면 재현율 0 < 0.95
    failing = tmp_path / "fail_evalset.jsonl"
    _write_jsonl(failing, [
        {"site_id": "f1", "gt_materials": ["ROOFING_SLATE"], "pred_materials": [],
         "gt_asbestos": True, "pred_asbestos": False},
    ])
    out = tmp_path / "runFail"

    result = run_cycle(
        CONFIG, evalset_path=str(failing), out_dir=str(out), base_train_path=str(base),
    )

    assert result.gate_passed is False
    assert result.promoted is False
    assert result.deploy_manifest_path is None
    assert not (out / "adapter-recognition" / "deploy_manifest.json").exists()
    mv = json.loads((out / "adapter-recognition" / "model_version.json").read_text(encoding="utf-8"))
    assert mv["eval_passed"] is False
    assert mv["status"] == "rejected"


def test_run_cycle_without_feedback_reevaluates_base(tmp_path):
    """피드백 없이도(재평가만) 사이클이 돈다."""
    base = _base_train(tmp_path)
    out = tmp_path / "runNoFb"
    result = run_cycle(
        CONFIG, evalset_path="eval_samples/sample_evalset.jsonl",
        out_dir=str(out), base_train_path=str(base),
    )
    assert result.dataset == {"base": 2, "feedback": 0, "total": 2}
    assert result.gate_passed is True
