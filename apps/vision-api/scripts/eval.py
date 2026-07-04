#!/usr/bin/env python3
"""평가셋 채점 CLI (기획서 §4.4). V3 종료 기준 미달 시 exit 1 (Phase 게이트).

    python scripts/eval.py --evalset eval_samples/sample_evalset.jsonl
"""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.eval import run_evalset


def main() -> int:
    p = argparse.ArgumentParser(description="디몰비전 평가셋 채점")
    p.add_argument("--evalset", default="eval_samples/sample_evalset.jsonl")
    args = p.parse_args()

    report = run_evalset(args.evalset)
    print(json.dumps(report.as_dict(), ensure_ascii=False, indent=2))
    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
