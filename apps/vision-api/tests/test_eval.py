"""평가 지표·러너 테스트 (기획서 §4.4)."""

import os

from app.eval import EvalSample, evaluate, run_evalset


def _s(gt_m, pred_m, gt_a, pred_a, gtq=None, pq=None, sid="s"):
    return EvalSample(sid, set(gt_m), set(pred_m), gt_a, pred_a, gtq, pq)


def test_perfect_predictions_pass():
    samples = [
        _s(["BRICK_MASONRY", "ROOFING_SLATE"], ["BRICK_MASONRY", "ROOFING_SLATE"], True, True, 8.0, 8.0),
        _s(["WOOD", "METAL"], ["WOOD", "METAL"], False, False, 10.0, 10.0),
    ]
    r = evaluate(samples)
    assert r.material_recall == 1.0
    assert r.asbestos_recall == 1.0
    assert r.quantity_within_tolerance == 1.0
    assert r.passed


def test_missed_asbestos_fails_gate():
    # 석면 정답 2건 중 1건 놓침 → 재현율 0.5 < 0.95
    samples = [
        _s(["ROOFING_SLATE"], ["ROOFING_SLATE"], True, True),
        _s(["ROOFING_SLATE"], ["BRICK_MASONRY"], True, False),
    ]
    r = evaluate(samples)
    assert r.asbestos_recall == 0.5
    assert not r.passed
    assert any("석면" in f for f in r.failures)


def test_low_material_recall_fails_gate():
    # 주요 5종 중 절반 놓침
    samples = [
        _s(["BRICK_MASONRY", "WOOD", "METAL", "ROOFING_SLATE"], ["BRICK_MASONRY", "WOOD"], False, False),
    ]
    r = evaluate(samples)
    assert r.material_recall == 0.5
    assert not r.passed
    assert any("재현율" in f for f in r.failures)


def test_quantity_tolerance():
    # ±40% 초과 1건, 이내 1건
    samples = [
        _s(["WOOD"], ["WOOD"], False, False, 10.0, 5.0),   # 0.5 초과
        _s(["WOOD"], ["WOOD"], False, False, 10.0, 9.0),   # 0.1 이내
    ]
    r = evaluate(samples)
    assert abs(r.quantity_within_tolerance - 0.5) < 1e-9


def test_bundled_sample_evalset_passes():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    r = run_evalset(os.path.join(here, "eval_samples", "sample_evalset.jsonl"))
    assert r.n == 5
    assert r.material_recall >= 0.85
    assert r.asbestos_recall >= 0.95
    assert r.passed
