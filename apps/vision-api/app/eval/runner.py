"""평가셋 로더/러너. 평가셋은 학습셋과 분리해 먼저 구축한다(§4.4).

평가셋 JSONL 한 줄 = 현장 1곳:
    {"site_id": "...", "domain": "site", "gt_materials": [...], "pred_materials": [...],
     "gt_asbestos": true, "pred_asbestos": true,
     "gt_quantity_ton": 8.0, "pred_quantity_ton": 6.0}

`domain` 은 표본이 어느 분포에서 왔는지다(aerial=항공 약라벨, patch=단일 자재 패치,
site=실제 철거 현장 지상 촬영). **site 표본이 있으면 게이트는 site 에서만 판정한다** —
학습 도메인 점수로 실배포 성능을 주장하지 않기 위해서다. 생략하면 unknown.
"""

from __future__ import annotations

import json
from typing import List

from .metrics import DOMAIN_UNKNOWN, EvalReport, EvalSample, evaluate


def load_evalset(path: str) -> List[EvalSample]:
    samples: List[EvalSample] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            samples.append(
                EvalSample(
                    site_id=d["site_id"],
                    gt_materials=set(d.get("gt_materials", [])),
                    pred_materials=set(d.get("pred_materials", [])),
                    gt_asbestos=bool(d.get("gt_asbestos", False)),
                    pred_asbestos=bool(d.get("pred_asbestos", False)),
                    gt_quantity_ton=d.get("gt_quantity_ton"),
                    pred_quantity_ton=d.get("pred_quantity_ton"),
                    domain=str(d.get("domain") or DOMAIN_UNKNOWN),
                )
            )
    return samples


def run_evalset(path: str) -> EvalReport:
    return evaluate(load_evalset(path))
