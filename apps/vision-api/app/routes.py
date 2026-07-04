"""HTTP 라우트 (기획서 §5.1).

/v1/jobs*        Edge Function 전용(API 키)
/v1/health       모니터링(공개)
/admin/reload    관리자 전용(관리자 키)
"""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from .auth import require_admin_key, require_api_key
from .config import Settings, get_settings
from .pipeline import get_pipeline
from .schemas import JobCreateRequest, JobResponse, JobStatus
from .store import JobStore
from .worker import JobWorker


def get_store(request: Request) -> JobStore:
    return request.app.state.store


def get_worker(request: Request) -> JobWorker:
    return request.app.state.worker


# --- /v1/jobs -------------------------------------------------------------

jobs_router = APIRouter(prefix="/v1/jobs", tags=["jobs"], dependencies=[Depends(require_api_key)])


@jobs_router.post("", status_code=status.HTTP_202_ACCEPTED, response_model=JobResponse)
def create_job(
    body: JobCreateRequest,
    store: JobStore = Depends(get_store),
    worker: JobWorker = Depends(get_worker),
    settings: Settings = Depends(get_settings),
) -> JobResponse:
    if len(body.photo_urls) > settings.max_photos:
        raise HTTPException(
            status_code=422,  # Unprocessable — 상수명이 Starlette 버전마다 달라 리터럴 사용
            detail=f"사진은 최대 {settings.max_photos}장까지 허용됩니다.",
        )
    job_id = str(uuid.uuid4())
    job = store.create(job_id, body, settings.model_version)
    worker.enqueue(job_id)
    return job


@jobs_router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: str, store: JobStore = Depends(get_store)) -> JobResponse:
    job = store.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="잡을 찾을 수 없습니다.")
    return job


@jobs_router.post("/{job_id}/cancel", response_model=JobResponse)
def cancel_job(job_id: str, store: JobStore = Depends(get_store)) -> JobResponse:
    job = store.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="잡을 찾을 수 없습니다.")
    if job.status in (JobStatus.DONE, JobStatus.FAILED, JobStatus.CANCELED):
        return job  # 이미 종료된 잡은 그대로 반환
    store.update(job_id, status=JobStatus.CANCELED, stage=None)
    return store.get(job_id)  # type: ignore[return-value]


# --- /v1/health -----------------------------------------------------------

health_router = APIRouter(prefix="/v1", tags=["health"])


@health_router.get("/health")
def health(
    worker: JobWorker = Depends(get_worker),
    settings: Settings = Depends(get_settings),
) -> dict:
    return {
        "status": "ok",
        "model_version": settings.model_version,
        "pipeline": settings.pipeline,
        "queue_length": worker.qsize(),
        "environment": settings.environment,
        # 운영 지표(§V4 비용/지연 모니터링).
        "metrics": worker.metrics.snapshot(),
        # GPU 메모리 등 실측치는 vllm 파이프라인 연동 시 채운다(§5.1).
        "gpu": None,
    }


# --- /admin/reload --------------------------------------------------------

admin_router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin_key)])


class ReloadRequest(BaseModel):
    model_adapter_hash: str
    model_base: Optional[str] = None


@admin_router.post("/reload")
def reload_model(
    body: ReloadRequest,
    request: Request,
    worker: JobWorker = Depends(get_worker),
    settings: Settings = Depends(get_settings),
) -> dict:
    """LoRA 어댑터 교체(모델 버전 롤아웃/롤백). 골격: 설정·파이프라인만 교체."""
    if body.model_base:
        settings.model_base = body.model_base
    settings.model_adapter_hash = body.model_adapter_hash
    new_pipeline = get_pipeline(settings)
    worker.set_pipeline(new_pipeline)
    request.app.state.pipeline = new_pipeline
    return {"status": "reloaded", "model_version": settings.model_version}
