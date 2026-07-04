"""잡 저장소 — SQLite (기획서 §3.3: 초기 인메모리+SQLite, 트래픽 증가 시 Redis).

durable 상태를 SQLite 에 두어 재기동 후에도 잡이 유실되지 않게 한다.
스케줄링(대기열)은 worker 의 인메모리 asyncio.Queue 가 담당하고, 이 저장소는 진실의 원천이다.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from typing import List, Optional

from .schemas import JobCreateRequest, JobResponse, JobStatus, VisionReport


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobStore:
    def __init__(self, db_path: str) -> None:
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    stage TEXT,
                    photo_urls TEXT NOT NULL DEFAULT '[]',
                    input_meta TEXT NOT NULL DEFAULT '{}',
                    callback_url TEXT,
                    result TEXT,
                    model_version TEXT NOT NULL,
                    error TEXT,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            self._conn.commit()

    def _row_to_response(self, row: sqlite3.Row) -> JobResponse:
        result = None
        if row["result"]:
            result = VisionReport.model_validate_json(row["result"])
        return JobResponse(
            id=row["id"],
            status=JobStatus(row["status"]),
            stage=row["stage"],
            result=result,
            model_version=row["model_version"],
            error=row["error"],
            attempts=row["attempts"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def create(
        self, job_id: str, request: JobCreateRequest, model_version: str
    ) -> JobResponse:
        now = _now()
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO jobs (id, status, photo_urls, input_meta, callback_url,
                                  model_version, attempts, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
                """,
                (
                    job_id,
                    JobStatus.QUEUED.value,
                    json.dumps(request.photo_urls, ensure_ascii=False),
                    json.dumps(request.input_meta, ensure_ascii=False),
                    request.callback_url,
                    model_version,
                    now,
                    now,
                ),
            )
            self._conn.commit()
        return self.get(job_id)  # type: ignore[return-value]

    def get(self, job_id: str) -> Optional[JobResponse]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM jobs WHERE id = ?", (job_id,)
            ).fetchone()
        return self._row_to_response(row) if row else None

    def get_request(self, job_id: str) -> Optional[JobCreateRequest]:
        """워커가 파이프라인에 넘길 원 요청(사진 URL·부가정보·콜백)을 복원."""
        with self._lock:
            row = self._conn.execute(
                "SELECT photo_urls, input_meta, callback_url FROM jobs WHERE id = ?",
                (job_id,),
            ).fetchone()
        if not row:
            return None
        return JobCreateRequest(
            photo_urls=json.loads(row["photo_urls"]),
            input_meta=json.loads(row["input_meta"]),
            callback_url=row["callback_url"],
        )

    def update(self, job_id: str, **fields: object) -> None:
        if not fields:
            return
        # result 는 VisionReport → JSON 직렬화
        if "result" in fields and isinstance(fields["result"], VisionReport):
            fields["result"] = fields["result"].model_dump_json()
        if "status" in fields and isinstance(fields["status"], JobStatus):
            fields["status"] = fields["status"].value
        fields["updated_at"] = _now()
        columns = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [job_id]
        with self._lock:
            self._conn.execute(f"UPDATE jobs SET {columns} WHERE id = ?", values)
            self._conn.commit()

    def requeuable_ids(self) -> List[str]:
        """재기동 시 다시 큐에 넣어야 할 잡(대기/처리 중이던 것)."""
        with self._lock:
            rows = self._conn.execute(
                "SELECT id FROM jobs WHERE status IN (?, ?) ORDER BY created_at",
                (JobStatus.QUEUED.value, JobStatus.PROCESSING.value),
            ).fetchall()
        return [r["id"] for r in rows]

    def close(self) -> None:
        with self._lock:
            self._conn.close()
