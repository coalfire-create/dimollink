"""비동기 잡 워커 (기획서 §3.2, §3.3).

단일 GPU 전제이므로 동시성 1 로 순차 처리한다. 인메모리 asyncio.Queue 로 스케줄링하고,
진실의 원천은 SQLite(JobStore)다. 실패 시 최대 max_retries 회 재시도 후 failed(§3.2).
"""

from __future__ import annotations

import asyncio
import logging
import time

from . import callback
from .config import Settings
from .metrics import Metrics
from .pipeline import AnalysisPipeline
from .schemas import JobStage, JobStatus
from .store import JobStore

logger = logging.getLogger("vision.worker")


class JobWorker:
    def __init__(
        self,
        settings: Settings,
        store: JobStore,
        pipeline: AnalysisPipeline,
        metrics: Metrics | None = None,
    ) -> None:
        self._settings = settings
        self._store = store
        self._pipeline = pipeline
        self._metrics = metrics or Metrics()
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._task: asyncio.Task | None = None

    def qsize(self) -> int:
        return self._queue.qsize()

    @property
    def metrics(self) -> Metrics:
        return self._metrics

    def set_pipeline(self, pipeline: AnalysisPipeline) -> None:
        """LoRA 어댑터 교체(POST /admin/reload) 시 파이프라인 교체."""
        self._pipeline = pipeline

    async def start(self) -> None:
        # 재기동 시 대기/처리 중이던 잡을 다시 큐에 적재
        for job_id in self._store.requeuable_ids():
            self._queue.put_nowait(job_id)
        self._task = asyncio.create_task(self._run(), name="vision-worker")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    def enqueue(self, job_id: str) -> None:
        self._queue.put_nowait(job_id)

    async def _run(self) -> None:
        while True:
            job_id = await self._queue.get()
            try:
                await self._process(job_id)
            except Exception as exc:  # noqa: BLE001 — 워커 루프는 죽지 않는다
                logger.exception("잡 처리 중 예외 job=%s: %s", job_id, exc)
            finally:
                self._queue.task_done()

    async def _process(self, job_id: str) -> None:
        job = self._store.get(job_id)
        if job is None or job.status in (JobStatus.DONE, JobStatus.CANCELED):
            return
        request = self._store.get_request(job_id)
        if request is None:
            return

        self._store.update(job_id, status=JobStatus.PROCESSING, error=None)
        started = time.monotonic()

        async def on_stage(stage: JobStage) -> None:
            self._store.update(job_id, stage=stage.value)
            updated = self._store.get(job_id)
            if updated:
                await callback.post_update(
                    request.callback_url, updated, self._settings.callback_secret
                )

        try:
            report = await asyncio.wait_for(
                self._pipeline.analyze(request, on_stage),
                timeout=self._settings.job_timeout_seconds,
            )
            # 출력 검증 레이어(§7.1) — 위반 시 저장/콜백하지 않고 실패 처리
            from .validation import validate_report

            issues = validate_report(report)
            if issues:
                raise ValueError("출력 검증 실패: " + "; ".join(issues))

            self._store.update(
                job_id, status=JobStatus.DONE, stage=None, result=report, error=None
            )
            self._metrics.record_success(time.monotonic() - started)
        except Exception as exc:  # noqa: BLE001
            await self._handle_failure(job_id, exc, time.monotonic() - started)

        done = self._store.get(job_id)
        if done:
            await callback.post_update(
                request.callback_url, done, self._settings.callback_secret
            )

    async def _handle_failure(self, job_id: str, exc: Exception, duration: float = 0.0) -> None:
        job = self._store.get(job_id)
        attempts = (job.attempts if job else 0) + 1
        if attempts <= self._settings.max_retries:
            logger.warning(
                "잡 재시도 job=%s attempt=%d/%d: %s",
                job_id,
                attempts,
                self._settings.max_retries,
                exc,
            )
            self._store.update(
                job_id, status=JobStatus.QUEUED, stage=None, attempts=attempts,
                error=str(exc),
            )
            self._queue.put_nowait(job_id)
        else:
            logger.error("잡 최종 실패 job=%s: %s", job_id, exc)
            self._store.update(
                job_id, status=JobStatus.FAILED, stage=None, attempts=attempts,
                error=str(exc),
            )
            self._metrics.record_failure(duration)
