"""KB 적재 오케스트레이션: 원문 → 청크 → 임베딩 → 저장 (기획서 §3.4).

저장기(Writer)는 교체 가능하다:
- JsonlWriter: 임베딩 포함 행을 JSONL 로 출력(검사·dry-run, 의존성 없음).
- PgWriter: kb_documents 로 upsert(psycopg 필요, source 단위 갱신 — 분기 1회 갱신 루틴).
"""

from __future__ import annotations

import glob
import json
import os
from dataclasses import asdict
from typing import Dict, List

from typing_extensions import Protocol

from .chunk import KbChunk, chunk_document
from .embed import Embedder, get_embedder


class Writer(Protocol):
    def write(self, rows: List[Dict]) -> int: ...


def load_sources(sources_dir: str) -> List[KbChunk]:
    """디렉터리의 *.md / *.txt 원문을 조항 단위 청크로 로드."""
    chunks: List[KbChunk] = []
    paths = sorted(glob.glob(os.path.join(sources_dir, "*.md")) + glob.glob(os.path.join(sources_dir, "*.txt")))
    for path in paths:
        # README 등 문서용 파일은 원문이 아니므로 제외.
        if os.path.basename(path).lower().startswith("readme"):
            continue
        with open(path, encoding="utf-8") as f:
            chunks.extend(chunk_document(f.read()))
    return chunks


def build_rows(chunks: List[KbChunk], embedder: Embedder) -> List[Dict]:
    embeddings = embedder.embed([c.body for c in chunks])
    rows: List[Dict] = []
    for c, emb in zip(chunks, embeddings):
        row = asdict(c)
        row["embedding"] = emb
        rows.append(row)
    return rows


def ingest(sources_dir: str, embedder: Embedder, writer: Writer) -> int:
    chunks = load_sources(sources_dir)
    rows = build_rows(chunks, embedder)
    return writer.write(rows)


class JsonlWriter:
    def __init__(self, path: str) -> None:
        self.path = path

    def write(self, rows: List[Dict]) -> int:
        with open(self.path, "w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        return len(rows)


def _vector_literal(emb: List[float]) -> str:
    return "[" + ",".join(repr(float(v)) for v in emb) + "]"


class PgWriter:
    """source 단위 전량 갱신(delete+insert). 분기 1회 갱신 루틴에 사용(§3.4)."""

    def __init__(self, dsn: str) -> None:
        self.dsn = dsn

    def write(self, rows: List[Dict]) -> int:  # pragma: no cover — Postgres 필요
        try:
            import psycopg
        except ImportError as exc:
            raise ImportError("PgWriter 는 kb extra 가 필요합니다: pip install '.[kb]'") from exc

        sources = sorted({r["source"] for r in rows})
        with psycopg.connect(self.dsn) as conn:
            with conn.cursor() as cur:
                for src in sources:
                    cur.execute("DELETE FROM kb_documents WHERE source = %s", (src,))
                for r in rows:
                    cur.execute(
                        """
                        INSERT INTO kb_documents (source, clause, body, revised_at, embedding)
                        VALUES (%s, %s, %s, %s, %s::vector)
                        """,
                        (r["source"], r["clause"], r["body"], r["revised_at"], _vector_literal(r["embedding"])),
                    )
            conn.commit()
        return len(rows)
