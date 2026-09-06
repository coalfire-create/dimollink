"""평가 체계 (기획서 §4.4) — 평가셋 채점 + V3 종료 기준 자동 판정."""

from .metrics import (
    ASBESTOS_SUSPECT_RECALL_TARGET,
    DEPLOYMENT_DOMAIN,
    DOMAIN_AERIAL,
    DOMAIN_PATCH,
    DOMAIN_SITE,
    DOMAIN_UNKNOWN,
    MAJOR_5_MATERIALS,
    MATERIAL_RECALL_TARGET,
    QUANTITY_ERROR_TOLERANCE_V1,
    ClassMetrics,
    EvalReport,
    EvalSample,
    evaluate,
)
from .runner import load_evalset, run_evalset

__all__ = [
    "EvalSample",
    "EvalReport",
    "evaluate",
    "load_evalset",
    "run_evalset",
    "MATERIAL_RECALL_TARGET",
    "ASBESTOS_SUSPECT_RECALL_TARGET",
    "QUANTITY_ERROR_TOLERANCE_V1",
    "MAJOR_5_MATERIALS",
    "ClassMetrics",
    "DEPLOYMENT_DOMAIN",
    "DOMAIN_AERIAL",
    "DOMAIN_PATCH",
    "DOMAIN_SITE",
    "DOMAIN_UNKNOWN",
]
