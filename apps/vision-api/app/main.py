"""FastAPI 앱 조립 (기획서 §3.1, §3.3).

lifespan 에서 잡 저장소·워커·파이프라인을 초기화하고 종료 시 정리한다.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import get_settings
from .pipeline import get_pipeline
from .routes import admin_router, health_router, jobs_router
from .store import JobStore
from .worker import JobWorker

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    store = JobStore(settings.db_path)
    pipeline = get_pipeline(settings)
    worker = JobWorker(settings, store, pipeline)

    app.state.settings = settings
    app.state.store = store
    app.state.pipeline = pipeline
    app.state.worker = worker

    await worker.start()
    try:
        yield
    finally:
        await worker.stop()
        store.close()


def create_app() -> FastAPI:
    app = FastAPI(
        title="디몰비전 AI 서버",
        version="0.1.0",
        description="철거 현장 사진 → 자재 인식·공정표·폐기물 계획 (자체 VLM). 기획서 §3, §5.",
        lifespan=lifespan,
    )
    app.include_router(jobs_router)
    app.include_router(health_router)
    app.include_router(admin_router)
    return app


app = create_app()
