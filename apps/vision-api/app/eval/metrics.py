"""평가 지표 (기획서 §4.4). V3 종료 기준(주요 5종 재현율 0.85, 석면 재현율 0.95)을 자동 판정.

⚠️ 목표 상수의 단일 원천은 packages/shared/vision-eval.ts 다. 여기는 Python 측 미러.
평가 지표는 순수 함수라 GPU 없이 검증 가능하다(예측 vs 정답을 넣으면 계산).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Set

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


@dataclass
class EvalSample:
    site_id: str
    gt_materials: Set[str]
    pred_materials: Set[str]
    gt_asbestos: bool
    pred_asbestos: bool
    gt_quantity_ton: Optional[float] = None
    pred_quantity_ton: Optional[float] = None


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

    def as_dict(self) -> Dict:
        return {
            "n": self.n,
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


def evaluate(
    samples: Sequence[EvalSample],
    *,
    major_materials: Set[str] = frozenset(MAJOR_5_MATERIALS),
    tolerance: float = QUANTITY_ERROR_TOLERANCE_V1,
) -> EvalReport:
    """평가셋 채점 + V3 종료 기준 판정."""
    material_recall, material_precision = _recall_precision(samples, set(major_materials))
    asbestos_recall, asbestos_fpr = _asbestos_metrics(samples)
    q_within, q_mean = _quantity_metrics(samples, tolerance)

    failures: List[str] = []
    if material_recall < MATERIAL_RECALL_TARGET:
        failures.append(f"주요 5종 재현율 {material_recall:.3f} < 목표 {MATERIAL_RECALL_TARGET}")
    if asbestos_recall < ASBESTOS_SUSPECT_RECALL_TARGET:
        failures.append(f"석면 의심 재현율 {asbestos_recall:.3f} < 목표 {ASBESTOS_SUSPECT_RECALL_TARGET}")

    return EvalReport(
        n=len(samples),
        material_recall=material_recall,
        material_precision=material_precision,
        asbestos_recall=asbestos_recall,
        asbestos_false_positive_rate=asbestos_fpr,
        quantity_within_tolerance=q_within,
        quantity_mean_rel_error=q_mean,
        passed=not failures,
        failures=failures,
    )
