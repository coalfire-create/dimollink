"""평가 지표 (기획서 §4.4). V3 종료 기준(주요 5종 재현율 0.85, 석면 재현율 0.95)을 자동 판정.

⚠️ 목표 상수의 단일 원천은 packages/shared/vision-eval.ts 다. 여기는 Python 측 미러.
평가 지표는 순수 함수라 GPU 없이 검증 가능하다(예측 vs 정답을 넣으면 계산).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Set

from ..taxonomy import MATERIAL_CODES

# vision-eval.ts 미러
MATERIAL_RECALL_TARGET = 0.85
ASBESTOS_SUSPECT_RECALL_TARGET = 0.95
QUANTITY_ERROR_TOLERANCE_V1 = 0.40

# "주요 5종"(철거 현장 빈출) — 파일럿 데이터 근거로 조정 가능.
MAJOR_5_MATERIALS = (
    "REINFORCED_CONCRETE",
    "BRICK_MASONRY",
    "WOOD",
    "METAL",
    "ROOFING_SLATE",
)

# 평가 표본의 도메인. 학습셋(항공 약라벨·MINC 지상 패치)과 실제 사용자가 찍는
# 지상 근접 현장 사진은 분포가 다르다 — 두 도메인을 한 숫자로 섞으면 실배포 성능을 과대평가한다.
DOMAIN_AERIAL = "aerial"        # VWorld 항공영상 + 건축물대장 약라벨
DOMAIN_PATCH = "patch"          # MINC/콘크리트 등 단일 자재 지상 패치
DOMAIN_SITE = "site"            # 실제 철거 현장 지상 촬영 — 배포 분포
DOMAIN_UNKNOWN = "unknown"

# 성능을 판정하는 기준 도메인. 이 도메인 표본이 있으면 게이트는 여기서만 판정한다.
DEPLOYMENT_DOMAIN = DOMAIN_SITE


@dataclass
class EvalSample:
    site_id: str
    gt_materials: Set[str]
    pred_materials: Set[str]
    gt_asbestos: bool
    pred_asbestos: bool
    gt_quantity_ton: Optional[float] = None
    pred_quantity_ton: Optional[float] = None
    #: 이 표본이 어느 분포에서 왔는지(aerial/patch/site). 미지정은 unknown.
    domain: str = DOMAIN_UNKNOWN


@dataclass
class ClassMetrics:
    """자재 1종의 성능. 정답 표본이 없으면(support=0) 재현율은 None — 1.0 으로 세지 않는다."""

    support: int
    recall: Optional[float]
    precision: Optional[float]

    def as_dict(self) -> Dict:
        return {
            "support": self.support,
            "recall": round(self.recall, 4) if self.recall is not None else None,
            "precision": round(self.precision, 4) if self.precision is not None else None,
        }


@dataclass
class EvalReport:
    n: int
    material_recall: float
    material_precision: float
    asbestos_recall: float
    asbestos_false_positive_rate: float
    quantity_within_tolerance: float
    quantity_mean_rel_error: Optional[float]
    passed: bool
    failures: List[str] = field(default_factory=list)
    #: 판정 기준이 된 도메인. 실현장 표본이 있으면 site, 없으면 all(전체 혼합).
    gate_domain: str = "all"
    #: 도메인별 재현율 — 학습 도메인 성능이 실배포 성능을 가리지 않게 나눠 본다.
    by_domain: Dict[str, Dict] = field(default_factory=dict)
    #: 자재 12종 개별 성능. 표본 없는 클래스는 recall=None(평가 불가)로 드러낸다.
    by_class: Dict[str, ClassMetrics] = field(default_factory=dict)
    #: 정답 표본이 하나도 없어 평가하지 못한 자재 코드.
    unevaluated_classes: List[str] = field(default_factory=list)

    def as_dict(self) -> Dict:
        return {
            "n": self.n,
            "gate_domain": self.gate_domain,
            "material_recall": round(self.material_recall, 4),
            "material_precision": round(self.material_precision, 4),
            "asbestos_recall": round(self.asbestos_recall, 4),
            "asbestos_false_positive_rate": round(self.asbestos_false_positive_rate, 4),
            "quantity_within_tolerance": round(self.quantity_within_tolerance, 4),
            "quantity_mean_rel_error": (
                round(self.quantity_mean_rel_error, 4) if self.quantity_mean_rel_error is not None else None
            ),
            "passed": self.passed,
            "failures": self.failures,
            "by_domain": self.by_domain,
            "by_class": {k: v.as_dict() for k, v in self.by_class.items()},
            "unevaluated_classes": self.unevaluated_classes,
        }


def _recall_precision(samples: Sequence[EvalSample], target_set: Set[str]) -> tuple:
    tp = fn = fp = 0
    for s in samples:
        gt = s.gt_materials & target_set
        pred = s.pred_materials & target_set
        tp += len(gt & pred)
        fn += len(gt - pred)
        fp += len(pred - gt)
    recall = tp / (tp + fn) if (tp + fn) else 1.0
    precision = tp / (tp + fp) if (tp + fp) else 1.0
    return recall, precision


def _asbestos_metrics(samples: Sequence[EvalSample]) -> tuple:
    tp = fn = fp = tn = 0
    for s in samples:
        if s.gt_asbestos and s.pred_asbestos:
            tp += 1
        elif s.gt_asbestos and not s.pred_asbestos:
            fn += 1
        elif not s.gt_asbestos and s.pred_asbestos:
            fp += 1
        else:
            tn += 1
    recall = tp / (tp + fn) if (tp + fn) else 1.0
    fpr = fp / (fp + tn) if (fp + tn) else 0.0
    return recall, fpr


def _quantity_metrics(samples: Sequence[EvalSample], tolerance: float) -> tuple:
    errors = []
    for s in samples:
        if s.gt_quantity_ton and s.gt_quantity_ton > 0 and s.pred_quantity_ton is not None:
            errors.append(abs(s.pred_quantity_ton - s.gt_quantity_ton) / s.gt_quantity_ton)
    if not errors:
        return 1.0, None
    within = sum(1 for e in errors if e <= tolerance) / len(errors)
    mean_err = sum(errors) / len(errors)
    return within, mean_err


def _per_class(samples: Sequence[EvalSample], codes: Sequence[str]) -> Dict[str, ClassMetrics]:
    """자재별 재현율·정밀도. 정답 표본이 0이면 recall=None(평가 불가)로 남긴다.

    합산 지표는 표본 없는 클래스를 1.0 으로 세어 가려버린다 — 어떤 클래스가
    아예 검증되지 않았는지가 드러나야 다음에 무슨 데이터를 모을지 정할 수 있다.
    """
    out: Dict[str, ClassMetrics] = {}
    for code in codes:
        tp = fn = fp = 0
        for s in samples:
            gt = code in s.gt_materials
            pred = code in s.pred_materials
            if gt and pred:
                tp += 1
            elif gt:
                fn += 1
            elif pred:
                fp += 1
        support = tp + fn
        out[code] = ClassMetrics(
            support=support,
            recall=(tp / support) if support else None,
            precision=(tp / (tp + fp)) if (tp + fp) else None,
        )
    return out


def _domain_summary(samples: Sequence[EvalSample], major: Set[str]) -> Dict[str, Dict]:
    """도메인별 요약 — 항공 약라벨 성능이 실현장 성능을 가리지 않게 나눠 본다."""
    by: Dict[str, List[EvalSample]] = {}
    for s in samples:
        by.setdefault(s.domain, []).append(s)
    out: Dict[str, Dict] = {}
    for domain, group in sorted(by.items()):
        recall, precision = _recall_precision(group, major)
        asb_recall, _ = _asbestos_metrics(group)
        out[domain] = {
            "n": len(group),
            "material_recall": round(recall, 4),
            "material_precision": round(precision, 4),
            "asbestos_recall": round(asb_recall, 4),
        }
    return out


def evaluate(
    samples: Sequence[EvalSample],
    *,
    major_materials: Set[str] = frozenset(MAJOR_5_MATERIALS),
    tolerance: float = QUANTITY_ERROR_TOLERANCE_V1,
    all_material_codes: Sequence[str] = MATERIAL_CODES,
) -> EvalReport:
    """평가셋 채점 + V3 종료 기준 판정.

    게이트는 **배포 도메인(실제 철거 현장 지상 사진)** 표본이 있으면 거기서만 판정한다.
    항공 약라벨·단일 자재 패치에서 잘 나오는 것은 실사용 성능을 보장하지 않는다.
    """
    major = set(major_materials)
    site_samples = [s for s in samples if s.domain == DEPLOYMENT_DOMAIN]
    gate_samples = site_samples if site_samples else samples
    gate_domain = DEPLOYMENT_DOMAIN if site_samples else "all"

    material_recall, material_precision = _recall_precision(gate_samples, major)
    asbestos_recall, asbestos_fpr = _asbestos_metrics(gate_samples)
    q_within, q_mean = _quantity_metrics(gate_samples, tolerance)

    failures: List[str] = []
    if material_recall < MATERIAL_RECALL_TARGET:
        failures.append(
            f"[{gate_domain}] 주요 5종 재현율 {material_recall:.3f} < 목표 {MATERIAL_RECALL_TARGET}"
        )
    if asbestos_recall < ASBESTOS_SUSPECT_RECALL_TARGET:
        failures.append(
            f"[{gate_domain}] 석면 의심 재현율 {asbestos_recall:.3f} < 목표 {ASBESTOS_SUSPECT_RECALL_TARGET}"
        )

    by_class = _per_class(gate_samples, all_material_codes)
    unevaluated = [code for code, m in by_class.items() if m.support == 0]

    return EvalReport(
        n=len(gate_samples),
        material_recall=material_recall,
        material_precision=material_precision,
        asbestos_recall=asbestos_recall,
        asbestos_false_positive_rate=asbestos_fpr,
        quantity_within_tolerance=q_within,
        quantity_mean_rel_error=q_mean,
        passed=not failures,
        failures=failures,
        gate_domain=gate_domain,
        by_domain=_domain_summary(samples, major),
        by_class=by_class,
        unevaluated_classes=unevaluated,
    )
