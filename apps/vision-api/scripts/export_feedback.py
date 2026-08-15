#!/usr/bin/env python3
"""실 피드백 저장소(Supabase) → feedback.jsonl 익스포트 (기획서 §V5).

플라이휠 재학습의 입력을 실데이터에 연결한다. DSN 은 config.db_url(VISION_DB_URL).

  # 전량
  python scripts/export_feedback.py --out data/feedback.jsonl
  # 증분(직전 사이클 이후)
  python scripts/export_feedback.py --out data/feedback.jsonl --since 2026-07-01

이 산출물을 retrain_cycle 이 소비한다:
  python scripts/retrain_cycle.py --feedback data/feedback.jsonl ...
(또는 retrain_cycle --from-db 로 한 번에)
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import get_settings
from app.feedback import PgFeedbackSource, export_feedback


def main() -> int:
    p = argparse.ArgumentParser(description="실 피드백 → feedback.jsonl")
    p.add_argument("--out", default="data/feedback.jsonl")
    p.add_argument("--since", help="ISO 날짜/시각. 이 시점 이후 피드백만(증분).")
    p.add_argument("--dsn", help="Postgres DSN. 미지정 시 config.db_url(VISION_DB_URL) 사용.")
    args = p.parse_args()

    dsn = args.dsn or get_settings().db_url
    if not dsn:
        print("DSN 이 없습니다. VISION_DB_URL 설정 또는 --dsn 지정.", file=sys.stderr)
        return 2

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    n = export_feedback(PgFeedbackSource(dsn), args.out, since=args.since)
    print(f"피드백 {n}건 → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
