#!/usr/bin/env python3
"""분기 1회 재학습·재평가·배포 루틴 CLI (기획서 §V5 데이터 플라이휠).

피드백 편입 → 학습셋 병합 → 학습(dry-run 배선 or GPU) → 평가 게이트 → 승격 결정을
한 번에 오케스트레이션한다. 게이트(§V3 재현율) 미달이면 승격하지 않고 exit 1.

  # 배선 검증(GPU 불필요): 피드백 편입·병합·대장·게이트까지 전부 검증
  python scripts/retrain_cycle.py \
      --feedback data/feedback.jsonl \
      --base data/train_recognition.jsonl \
      --evalset eval_samples/sample_evalset.jsonl \
      --out runs/2026Q3

  # 실학습(GPU 필요, Colab/GCP): --gpu 추가

산출물(--out 아래):
  train_recognition.jsonl     병합된 다음 학습셋
  feedback_examples.jsonl     피드백에서 만든 과업별 예시(감사용)
  adapter-recognition/        어댑터 메타·대장(model_version.json: eval_passed 채워짐)
  adapter-recognition/deploy_manifest.json   게이트 통과 시에만 생성(배포 후보)
"""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.flywheel import run_cycle
from training.train import _load_yaml


def main() -> int:
    p = argparse.ArgumentParser(description="디몰비전 분기 재학습 플라이휠")
    p.add_argument("--config", default="training/qlora_config.yaml")
    p.add_argument("--task", default="recognition", choices=["recognition", "generation"])
    p.add_argument("--feedback", help="피드백 JSONL(app/feedback 형식). 없으면 재평가만.")
    p.add_argument("--base", help="기존 학습셋 JSONL(병합 대상). 없으면 피드백만으로 구성.")
    p.add_argument("--evalset", default="eval_samples/sample_evalset.jsonl")
    p.add_argument("--out", required=True, help="이번 사이클 산출물 디렉토리")
    p.add_argument("--min-rating", type=int, default=4, help="미교정 피드백 채택 최소 평점")
    p.add_argument("--gpu", action="store_true", help="실 QLoRA 학습(GPU 필요). 기본은 dry-run 배선")
    args = p.parse_args()

    config = _load_yaml(args.config)
    result = run_cycle(
        config,
        evalset_path=args.evalset,
        out_dir=args.out,
        feedback_path=args.feedback,
        base_train_path=args.base,
        task=args.task,
        do_train=args.gpu,
        min_rating=args.min_rating,
    )

    print(json.dumps(result.as_dict(), ensure_ascii=False, indent=2))
    # 게이트 미달 시 exit 1 — 배포 파이프라인이 승격을 막도록(Phase 게이트).
    return 0 if result.gate_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
