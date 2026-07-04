from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings

API_KEY = "test-edge-key"
ADMIN_KEY = "test-admin-key"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("VISION_API_KEY", API_KEY)
    monkeypatch.setenv("VISION_ADMIN_KEY", ADMIN_KEY)
    monkeypatch.setenv("VISION_PIPELINE", "mock")
    monkeypatch.setenv("VISION_DB_PATH", str(tmp_path / "test_jobs.db"))
    monkeypatch.setenv("VISION_ENVIRONMENT", "test")
    get_settings.cache_clear()

    # create_app import 후 lifespan 이 워커를 띄운다(TestClient 컨텍스트 매니저).
    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c

    get_settings.cache_clear()


def wait_for_status(client, job_id, target, tries=100):
    """mock 파이프라인은 빠르므로 짧게 폴링한다."""
    import time

    for _ in range(tries):
        r = client.get(f"/v1/jobs/{job_id}", headers={"X-API-Key": API_KEY})
        assert r.status_code == 200
        body = r.json()
        if body["status"] == target:
            return body
        time.sleep(0.02)
    raise AssertionError(f"잡이 {target} 상태에 도달하지 못했습니다: {body}")
