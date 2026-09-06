#!/usr/bin/env python3
"""평가셋 채점 CLI (기획서 §4.4). V3 종료 기준 미달 시 exit 1 (Phase 게이트).

    python scripts/eval.py --evalset eval_samples/sample_evalset.jsonl

평가셋에 실현장(domain=site) 표본이 있으면 게이트는 그 도메인에서만 판정한다.
항공 약라벨·단일 자재 패치 점수로 실배포 성능을 주장하지 않기 위해서다.
`--domain` 으로 특정 도메인만 따로 채점할 수도 있다.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.eval import evaluate, load_evalset


def main() -> int:
    p = argparse.ArgumentParser(description="디몰비전 평가셋 채점")
    p.add_argument("--evalset", default="eval_samples/sample_evalset.jsonl")
    p.add_argument(
        "--domain",
        help="이 도메인 표본만 채점(aerial|patch|site). 미지정 시 전체를 읽고 site 가 있으면 site 로 판정.",
    )
    args = p.parse_args()

    samples = load_evalset(args.evalset)
    if args.domain:
        samples = [s for s in samples if s.domain == args.domain]
        if not samples:
            print(f"[eval] domain={args.domain} 표본이 없습니다.", file=sys.stderr)
            return 1

    report = evaluate(samples)
    print(json.dumps(report.as_dict(), ensure_ascii=False, indent=2))

    if report.gate_domain != "site":
        print(
            "[eval] 경고: 실현장(domain=site) 표본이 없어 학습 도메인 혼합 점수로 판정했습니다. "
            "이 수치는 실사용 성능을 보장하지 않습니다.",
            file=sys.stderr,
        )
    if report.unevaluated_classes:
        print(
            f"[eval] 평가 불가(정답 표본 0건) 자재: {', '.join(report.unevaluated_classes)}",
            file=sys.stderr,
        )
    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
