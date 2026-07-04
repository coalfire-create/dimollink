"""RAG 검색 (기획서 §3.4) — 쿼리 임베딩으로 kb_documents 근접 청크를 찾는다.

공정표의 안전 지침은 반드시 검색된 근거 청크를 인용해 생성한다(환각 억제, §3.4).
저장기와 대칭으로 검색기도 교체 가능하다:
- InMemoryRetriever: 원문/행을 메모리에서 코사인 랭킹(로컬/CI, 의존성 없음).
- PgRetriever: pgvector 코사인 거리 연산자(<=>)로 Postgres 검색(psycopg 필요).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Optional

from typing_extensions import Protocol

from .embed import Embedder
from .ingest import build_rows, load_sources


@dataclass
class RetrievedChunk:
    source: str
    clause: Optional[str]
    body: str
    score: float


def cosine_similarity(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


class Retriever(Protocol):
    def search(self, query: str, top_k: int = 3) -> List[RetrievedChunk]: ...


class InMemoryRetriever:
    def __init__(self, rows: List[Dict], embedder: Embedder) -> None:
        self._rows = rows
        self._embedder = embedder

    def search(self, query: str, top_k: int = 3) -> List[RetrievedChunk]:
        if not self._rows:
            return []
        q = self._embedder.embed([query])[0]
        scored = [
            RetrievedChunk(
                source=r["source"], clause=r.get("clause"), body=r["body"],
                score=cosine_similarity(q, r["embedding"]),
            )
            for r in self._rows
        ]
        scored.sort(key=lambda c: c.score, reverse=True)
        return scored[:top_k]


class PgRetriever:
    """pgvector 코사인 검색. 저장 임베딩과 동일 임베더로 쿼리해야 한다."""

    def __init__(self, dsn: str, embedder: Embedder) -> None:
        self.dsn = dsn
        self._embedder = embedder

    def search(self, query: str, top_k: int = 3) -> List[RetrievedChunk]:  # pragma: no cover — Postgres 필요
        try:
            import psycopg
        except ImportError as exc:
            raise ImportError("PgRetriever 는 kb extra 가 필요합니다: pip install '.[kb]'") from exc
        q = self._embedder.embed([query])[0]
        q_lit = "[" + ",".join(repr(float(v)) for v in q) + "]"
        with psycopg.connect(self.dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT source, clause, body, 1 - (embedding <=> %s::vector) AS score
                    FROM kb_documents
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s
                    """,
                    (q_lit, q_lit, top_k),
                )
                return [
                    RetrievedChunk(source=s, clause=c, body=b, score=float(score))
                    for (s, c, b, score) in cur.fetchall()
                ]


def build_inmemory_retriever(sources_dir: str, embedder: Embedder) -> InMemoryRetriever:
    """원문 디렉터리를 청킹·임베딩해 메모리 검색기를 만든다(로컬/CI)."""
    rows = build_rows(load_sources(sources_dir), embedder)
    return InMemoryRetriever(rows, embedder)
