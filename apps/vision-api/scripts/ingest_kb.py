#!/usr/bin/env python3
"""KB 적재 CLI (기획서 §3.4).

예) 목 임베딩 → JSONL 검사:
    python scripts/ingest_kb.py --sources-dir kb_sources --out kb_chunks.jsonl

예) 실제 BGE-M3 → Postgres 적재(kb extra 설치 필요):
    python scripts/ingest_kb.py --embedder bge-m3 --dsn "$SUPABASE_DB_URL"
"""

from __future__ import annotations

import argparse
import sys

# app 패키지 임포트를 위해 프로젝트 루트를 경로에 추가
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.dirname(__import__("os").path.abspath(__file__))))

from app.kb import JsonlWriter, PgWriter, get_embedder, ingest


def main() -> int:
    p = argparse.ArgumentParser(description="디몰비전 RAG 지식베이스 적재")
    p.add_argument("--sources-dir", default="kb_sources", help="원문 디렉터리(*.md, *.txt)")
    p.add_argument("--embedder", choices=["mock", "bge-m3"], default="mock")
    p.add_argument("--model-path", default="BAAI/bge-m3", help="bge-m3 모델 경로")
    p.add_argument("--out", default="kb_chunks.jsonl", help="JSONL 출력 경로(--dsn 없을 때)")
    p.add_argument("--dsn", default=None, help="Postgres DSN(지정 시 kb_documents 로 적재)")
    args = p.parse_args()

    embedder = get_embedder(args.embedder, model_path=args.model_path) if args.embedder == "bge-m3" else get_embedder("mock")
    writer = PgWriter(args.dsn) if args.dsn else JsonlWriter(args.out)

    count = ingest(args.sources_dir, embedder, writer)
    dest = f"Postgres({'kb_documents'})" if args.dsn else args.out
    print(f"적재 완료: {count}개 청크 → {dest} (embedder={args.embedder})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
