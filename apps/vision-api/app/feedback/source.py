"""실 피드백 저장소 → 플라이휠 입력 연결 (기획서 §V5 데이터 플라이휠).

`app/feedback/export.py` 는 `FeedbackRecord` 리스트를 학습 예시로 바꾸지만,
그 레코드가 **어디서 오는지**가 비어 있었다(손수 만든 JSONL). 이 모듈이 그 구멍을 메운다:
실제 Supabase 저장소(`feedback` + `analyses` + `analysis_images`)에서 레코드를 끌어와
`load_feedback_jsonl` 이 읽는 형식의 JSONL 로 떨군다. 이렇게 하면 파이프라인이 이어진다:

  Supabase feedback ─(PgFeedbackSource)→ FeedbackRecord ─(dump_feedback_jsonl)→ feedback.jsonl
    ─(retrain_cycle)→ 학습 → 평가 게이트 → 어댑터 승격

DB 스키마 근거(supabase/migrations/0001_init.sql):
  feedback(analysis_id, rating, corrected_result) + analyses(input_meta, result)
  + analysis_images(storage_path) 를 analysis_id 로 조인한다.
"""

from __future__ import annotations

import json
from typing import List, Optional, Protocol

from .export import FeedbackRecord

# feedback + analyses + analysis_images 조인. 한 피드백 = 한 현장(analysis).
# result → model_result(모델 출력), corrected_result → 사람 교정 정답, storage_path → 이미지.
_FEEDBACK_QUERY = """
SELECT
    f.analysis_id::text                                          AS analysis_id,
    f.rating                                                     AS rating,
    f.corrected_result                                           AS corrected_result,
    a.input_meta                                                 AS input_meta,
    a.result                                                     AS model_result,
    coalesce(
        array_agg(ai.storage_path) FILTER (WHERE ai.storage_path IS NOT NULL),
        '{}'
    )                                                            AS image_paths
FROM feedback f
JOIN analyses a ON a.id = f.analysis_id
LEFT JOIN analysis_images ai ON ai.analysis_id = f.analysis_id
__WHERE__
GROUP BY f.id, a.id
ORDER BY f.created_at
"""
# 주의: SQL 안에 빈 배열 리터럴 '{}' 가 있어 str.format 을 쓰면 치환 필드로 오인된다.
# where 절은 sentinel 치환(.replace)으로 끼운다.


class FeedbackSource(Protocol):
    """피드백 레코드 공급원. 실서비스는 Postgres, 테스트/로컬은 인메모리."""

    def fetch(self, *, since: Optional[str] = None) -> List[FeedbackRecord]:
        ...


class InMemoryFeedbackSource:
    """테스트·로컬용. 미리 만든 레코드를 그대로 돌려준다."""

    def __init__(self, records: List[FeedbackRecord]) -> None:
        self._records = records

    def fetch(self, *, since: Optional[str] = None) -> List[FeedbackRecord]:
        return list(self._records)


class PgFeedbackSource:
    """Supabase(Postgres)에서 실 피드백을 끌어온다. `since` 로 증분 수집(직전 사이클 이후)."""

    def __init__(self, dsn: str) -> None:
        if not dsn:
            raise ValueError("PgFeedbackSource 는 DSN 이 필요합니다(config.db_url / VISION_DB_URL).")
        self.dsn = dsn

    def fetch(self, *, since: Optional[str] = None) -> List[FeedbackRecord]:  # pragma: no cover — Postgres 필요
        try:
            import psycopg
        except ImportError as exc:
            raise ImportError("PgFeedbackSource 는 kb extra 가 필요합니다: pip install '.[kb]'") from exc

        where = "WHERE f.created_at >= %s" if since else ""
        params = (since,) if since else ()
        sql = _FEEDBACK_QUERY.replace("__WHERE__", where)

        records: List[FeedbackRecord] = []
        with psycopg.connect(self.dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                for analysis_id, rating, corrected, input_meta, model_result, image_paths in cur.fetchall():
                    records.append(
                        FeedbackRecord(
                            analysis_id=analysis_id,
                            image_paths=list(image_paths or []),
                            input_meta=input_meta or {},
                            model_result=model_result or {},
                            corrected_result=corrected,
                            rating=rating,
                        )
                    )
        return records


def dump_feedback_jsonl(records: List[FeedbackRecord], path: str) -> int:
    """FeedbackRecord 를 `load_feedback_jsonl` 이 읽는 형식으로 기록한다(왕복 호환)."""
    with open(path, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps({
                "analysis_id": r.analysis_id,
                "image_paths": r.image_paths,
                "input_meta": r.input_meta,
                "model_result": r.model_result,
                "corrected_result": r.corrected_result,
                "rating": r.rating,
            }, ensure_ascii=False) + "\n")
    return len(records)


def export_feedback(source: FeedbackSource, path: str, *, since: Optional[str] = None) -> int:
    """실 저장소 → feedback.jsonl. 반환값 = 내보낸 레코드 수."""
    records = source.fetch(since=since)
    return dump_feedback_jsonl(records, path)
