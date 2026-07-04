"""임베딩 (기획서 §3.4 — 오픈소스 BGE-M3 로컬 구동, 외부 API 무종속).

- BGEM3Embedder: 실제 BGE-M3(선택 의존성). GPU/모델 가중치 필요 → 로컬/CI 미사용.
- MockEmbedder: 모델 없이 결정적 1024차원 벡터 생성(파이프라인 배관 검증용).

임베딩 차원은 kb_documents.embedding vector(1024) 와 일치해야 한다.
"""

from __future__ import annotations

import hashlib
import math
import random
from typing import List

from typing_extensions import Protocol, runtime_checkable

EMBED_DIM = 1024  # BGE-M3 dense 차원. schema 의 vector(1024) 와 일치.


@runtime_checkable
class Embedder(Protocol):
    dim: int

    def embed(self, texts: List[str]) -> List[List[float]]: ...


class MockEmbedder:
    """텍스트 해시 시드 기반 결정적 단위 벡터. 외부 의존성 없음."""

    def __init__(self, dim: int = EMBED_DIM) -> None:
        self.dim = dim

    def _one(self, text: str) -> List[float]:
        seed = int.from_bytes(hashlib.sha256(text.encode("utf-8")).digest()[:8], "big")
        rng = random.Random(seed)
        vec = [rng.gauss(0.0, 1.0) for _ in range(self.dim)]
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    def embed(self, texts: List[str]) -> List[List[float]]:
        return [self._one(t) for t in texts]


class BGEM3Embedder:
    """실제 BGE-M3 임베딩. `pip install '.[kb]'` 후 사용. (미검증 — 모델 필요)"""

    def __init__(self, model_path: str = "BAAI/bge-m3", device: str = "cpu") -> None:
        self.dim = EMBED_DIM
        try:
            from FlagEmbedding import BGEM3FlagModel  # type: ignore
        except ImportError as exc:  # pragma: no cover
            raise ImportError(
                "BGE-M3 임베더는 kb extra 가 필요합니다: pip install '.[kb]'"
            ) from exc
        self._model = BGEM3FlagModel(model_path, use_fp16=(device != "cpu"))

    def embed(self, texts: List[str]) -> List[List[float]]:  # pragma: no cover
        out = self._model.encode(texts, return_dense=True)["dense_vecs"]
        return [list(map(float, v)) for v in out]


def get_embedder(kind: str = "mock", **kwargs) -> Embedder:
    if kind == "bge-m3":
        return BGEM3Embedder(**kwargs)
    return MockEmbedder()
