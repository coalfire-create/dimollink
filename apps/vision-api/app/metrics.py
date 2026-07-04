"""운영 지표 (기획서 §4.4 운영 지표, §V4 비용/지연 모니터링).

경량 인메모리 카운터. 잡 처리량·지연을 /v1/health 로 노출한다.
멀티 인스턴스·영속 지표가 필요해지면 Prometheus/외부 수집으로 확장한다.
"""

from __future__ import annotations

import threading
from typing import Dict, Optional


class Metrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.jobs_succeeded = 0
        self.jobs_failed = 0
        self._total_duration = 0.0
        self.last_duration_seconds: Optional[float] = None

    def record_success(self, duration_seconds: float) -> None:
        with self._lock:
            self.jobs_succeeded += 1
            self._total_duration += duration_seconds
            self.last_duration_seconds = duration_seconds

    def record_failure(self, duration_seconds: float) -> None:
        with self._lock:
            self.jobs_failed += 1
            self._total_duration += duration_seconds
            self.last_duration_seconds = duration_seconds

    def snapshot(self) -> Dict:
        with self._lock:
            processed = self.jobs_succeeded + self.jobs_failed
            avg = self._total_duration / processed if processed else None
            return {
                "jobs_processed": processed,
                "jobs_succeeded": self.jobs_succeeded,
                "jobs_failed": self.jobs_failed,
                "avg_duration_seconds": round(avg, 3) if avg is not None else None,
                "last_duration_seconds": (
                    round(self.last_duration_seconds, 3)
                    if self.last_duration_seconds is not None
                    else None
                ),
            }
