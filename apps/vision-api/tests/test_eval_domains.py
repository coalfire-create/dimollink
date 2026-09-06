"""평가 도메인 분리 (§4.4 보강).

핵심 불변식: 학습 도메인(항공 약라벨·단일 자재 패치)에서 잘 나오는 것으로
실배포 성능을 주장하지 않는다. 실현장(site) 표본이 있으면 게이트는 거기서만 판정한다.
"""

from __future__ import annotations

from app.eval import DOMAIN_AERIAL, DOMAIN_PATCH, DOMAIN_SITE, EvalSample, evaluate


def sample(
    site_id: str,
    domain: str,
    gt: list,
    pred: list,
    gt_asbestos: bool = False,
    pred_asbestos: bool = False,
) -> EvalSample:
    return EvalSample(
        site_id=site_id,
        gt_materials=set(gt),
        pred_materials=set(pred),
        gt_asbestos=gt_asbestos,
        pred_asbestos=pred_asbestos,
        domain=domain,
    )


def test_gate_uses_site_domain_when_available():
    # 항공에서는 완벽하지만 실현장에서는 절반만 맞히는 모델.
    samples = [
        sample("a1", DOMAIN_AERIAL, ["REINFORCED_CONCRETE"], ["REINFORCED_CONCRETE"]),
        sample("a2", DOMAIN_AERIAL, ["BRICK_MASONRY"], ["BRICK_MASONRY"]),
        sample("s1", DOMAIN_SITE, ["REINFORCED_CONCRETE", "WOOD"], ["REINFORCED_CONCRETE"]),
        sample("s2", DOMAIN_SITE, ["METAL", "BRICK_MASONRY"], ["METAL"]),
    ]
    report = evaluate(samples)

    assert report.gate_domain == DOMAIN_SITE
    assert report.n == 2  # site 표본만 채점
    # 혼합했으면 0.83 으로 통과했겠지만, 실현장만 보면 0.5 라 미달이다.
    assert report.material_recall == 0.5
    assert report.passed is False
    assert "[site]" in report.failures[0]


def test_domain_breakdown_shows_both():
    samples = [
        sample("a1", DOMAIN_AERIAL, ["REINFORCED_CONCRETE"], ["REINFORCED_CONCRETE"]),
        sample("p1", DOMAIN_PATCH, ["WOOD"], ["WOOD"]),
        sample("s1", DOMAIN_SITE, ["WOOD"], []),
    ]
    report = evaluate(samples)

    assert report.by_domain[DOMAIN_AERIAL]["material_recall"] == 1.0
    assert report.by_domain[DOMAIN_PATCH]["material_recall"] == 1.0
    assert report.by_domain[DOMAIN_SITE]["material_recall"] == 0.0
    assert report.by_domain[DOMAIN_SITE]["n"] == 1


def test_falls_back_to_all_samples_without_site_domain():
    samples = [sample("a1", DOMAIN_AERIAL, ["WOOD"], ["WOOD"])]
    report = evaluate(samples)
    # site 표본이 없으면 혼합으로 판정하되, gate_domain 이 그 사실을 드러낸다.
    assert report.gate_domain == "all"
    assert report.n == 1


def test_zero_support_class_is_unevaluated_not_perfect():
    """정답 표본이 없는 클래스를 재현율 1.0 으로 세면 성능이 부풀려진다."""
    samples = [sample("s1", DOMAIN_SITE, ["WOOD"], ["WOOD"])]
    report = evaluate(samples)

    assert report.by_class["WOOD"].recall == 1.0
    assert report.by_class["WOOD"].support == 1
    # 석고보드·단열재는 학습 데이터가 없어 평가 자체가 불가능하다 — 숨기지 않는다.
    assert report.by_class["GYPSUM_BOARD"].recall is None
    assert report.by_class["GYPSUM_BOARD"].support == 0
    assert "GYPSUM_BOARD" in report.unevaluated_classes
    assert "WATERPROOF_INSULATION" in report.unevaluated_classes
    assert "WOOD" not in report.unevaluated_classes


def test_per_class_precision_counts_false_positives():
    samples = [
        sample("s1", DOMAIN_SITE, ["WOOD"], ["WOOD", "GLASS"]),
        sample("s2", DOMAIN_SITE, ["WOOD"], ["WOOD"]),
    ]
    report = evaluate(samples)
    assert report.by_class["WOOD"].recall == 1.0
    # GLASS 는 정답이 없는데 예측만 나왔다 — 정밀도 0, 재현율은 평가 불가.
    assert report.by_class["GLASS"].precision == 0.0
    assert report.by_class["GLASS"].recall is None


def test_asbestos_gate_also_judged_on_site_domain():
    samples = [
        sample("a1", DOMAIN_AERIAL, ["ROOFING_SLATE"], ["ROOFING_SLATE"], True, True),
        sample("s1", DOMAIN_SITE, ["ROOFING_SLATE"], ["ROOFING_SLATE"], True, False),
    ]
    report = evaluate(samples)
    assert report.asbestos_recall == 0.0
    assert any("석면" in f for f in report.failures)
