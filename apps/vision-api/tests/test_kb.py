"""RAG KB 적재 파이프라인 테스트 (mock 임베딩 + JSONL)."""

import json
import os

from app.kb import (
    EMBED_DIM,
    InMemoryRetriever,
    JsonlWriter,
    MockEmbedder,
    build_inmemory_retriever,
    build_rows,
    chunk_document,
    cosine_similarity,
    ingest,
    load_sources,
)
from app.kb.chunk import KbChunk

SAMPLE = """---
source: 테스트 지침
revised_at: 2024-01-01
---

## 제1조(목적)
이 지침은 시험을 위한 것이다.

## 제2조(적용)
""" + ("가" * 2000)  # 긴 본문 → 창 분할 유발


def test_chunk_parses_front_matter_and_clauses():
    chunks = chunk_document(SAMPLE, max_chars=800, overlap=100)
    assert all(isinstance(c, KbChunk) for c in chunks)
    assert all(c.source == "테스트 지침" for c in chunks)
    assert all(c.revised_at == "2024-01-01" for c in chunks)
    clauses = {c.clause for c in chunks}
    assert "제1조(목적)" in clauses
    assert "제2조(적용)" in clauses


def test_long_body_is_windowed():
    chunks = [c for c in chunk_document(SAMPLE, max_chars=800, overlap=100) if c.clause == "제2조(적용)"]
    assert len(chunks) >= 2  # 2000자 본문이 800자 창으로 분할
    assert all(len(c.body) <= 800 for c in chunks)


def test_mock_embedder_is_deterministic_and_correct_dim():
    e = MockEmbedder()
    assert e.dim == EMBED_DIM == 1024
    a = e.embed(["석면 의심"])
    b = e.embed(["석면 의심"])
    assert a == b  # 결정적
    assert len(a[0]) == 1024
    # 단위 벡터
    norm = sum(v * v for v in a[0]) ** 0.5
    assert abs(norm - 1.0) < 1e-6
    # 다른 텍스트는 다른 벡터
    assert e.embed(["다른 문장"])[0] != a[0]


def test_build_rows_attaches_embeddings():
    chunks = [KbChunk(source="s", clause="c", body="본문", revised_at=None)]
    rows = build_rows(chunks, MockEmbedder())
    assert rows[0]["source"] == "s"
    assert rows[0]["clause"] == "c"
    assert len(rows[0]["embedding"]) == 1024


def test_ingest_to_jsonl(tmp_path):
    src = tmp_path / "sources"
    src.mkdir()
    (src / "doc.md").write_text(SAMPLE, encoding="utf-8")
    out = tmp_path / "out.jsonl"

    count = ingest(str(src), MockEmbedder(), JsonlWriter(str(out)))
    assert count > 0

    lines = out.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == count
    row = json.loads(lines[0])
    for key in ("source", "clause", "body", "revised_at", "embedding"):
        assert key in row
    assert len(row["embedding"]) == 1024


def test_cosine_similarity():
    assert abs(cosine_similarity([1, 0, 0], [1, 0, 0]) - 1.0) < 1e-9
    assert abs(cosine_similarity([1, 0], [0, 1])) < 1e-9


def test_inmemory_retriever_ranks_exact_match_top():
    embedder = MockEmbedder()
    rows = build_rows(
        [
            KbChunk(source="A", clause="c1", body="사전조사 및 작업계획", revised_at=None),
            KbChunk(source="B", clause="c2", body="석면 슬레이트 지붕재 처리", revised_at=None),
        ],
        embedder,
    )
    retriever = InMemoryRetriever(rows, embedder)
    # 쿼리를 청크 본문과 동일하게 주면 결정적 임베딩이 일치 → top-1 score ≈ 1.0
    hits = retriever.search("석면 슬레이트 지붕재 처리", top_k=2)
    assert hits[0].source == "B"
    assert abs(hits[0].score - 1.0) < 1e-6


def test_build_inmemory_retriever_from_bundled_sources():
    import os

    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    retriever = build_inmemory_retriever(os.path.join(here, "kb_sources"), MockEmbedder())
    hits = retriever.search("석면 해체 안전", top_k=3)
    assert len(hits) > 0
    assert all(h.source for h in hits)


def test_load_bundled_sample_sources():
    # 리포지토리에 포함된 샘플 원문이 로드되는지
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    chunks = load_sources(os.path.join(here, "kb_sources"))
    assert len(chunks) > 0
    assert any("KOSHA" in c.source for c in chunks)
    # README 는 원문이 아니므로 적재에서 제외된다.
    assert all(c.source != "미상 출처" for c in chunks)
    assert all("포맷" != c.clause for c in chunks)
