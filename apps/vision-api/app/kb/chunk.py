"""법령·지침 원문 → 조항 단위 청크 (기획서 §3.4 RAG 지식베이스).

입력 포맷(경량): 파일 상단 front matter(--- 사이 key: value) + `## <조항>` 헤더로 조항 구분.
    ---
    source: KOSHA 해체공사 안전보건작업 지침
    revised_at: 2023-12-01
    ---
    ## 제5조(해체작업계획서)
    본문...

각 조항 본문이 max_chars 를 넘으면 overlap 을 두고 창 분할한다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class KbChunk:
    source: str
    clause: Optional[str]
    body: str
    revised_at: Optional[str] = None


_FRONT_MATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.S)
_CLAUSE_HEADER = re.compile(r"^##\s+(.*)$", re.M)


def _parse_front_matter(text: str) -> tuple[dict, str]:
    m = _FRONT_MATTER.match(text)
    if not m:
        return {}, text
    meta: dict = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            meta[k.strip()] = v.strip()
    return meta, text[m.end():]


def _window(body: str, max_chars: int, overlap: int) -> List[str]:
    body = body.strip()
    if len(body) <= max_chars:
        return [body] if body else []
    step = max(1, max_chars - overlap)
    return [body[i : i + max_chars].strip() for i in range(0, len(body), step) if body[i : i + max_chars].strip()]


def chunk_document(text: str, *, max_chars: int = 800, overlap: int = 100) -> List[KbChunk]:
    """단일 문서 텍스트 → KbChunk 목록."""
    meta, rest = _parse_front_matter(text)
    source = meta.get("source", "미상 출처")
    revised_at = meta.get("revised_at") or None

    chunks: List[KbChunk] = []
    headers = list(_CLAUSE_HEADER.finditer(rest))
    if not headers:
        # 헤더가 없으면 문서 전체를 창 분할(조항 없음).
        for part in _window(rest, max_chars, overlap):
            chunks.append(KbChunk(source=source, clause=None, body=part, revised_at=revised_at))
        return chunks

    for i, h in enumerate(headers):
        clause = h.group(1).strip()
        start = h.end()
        end = headers[i + 1].start() if i + 1 < len(headers) else len(rest)
        body = rest[start:end].strip()
        for part in _window(body, max_chars, overlap):
            chunks.append(KbChunk(source=source, clause=clause, body=part, revised_at=revised_at))
    return chunks
