from tests.conftest import ADMIN_KEY, API_KEY, wait_for_status


def _create(client):
    return client.post(
        "/v1/jobs",
        headers={"X-API-Key": API_KEY},
        json={
            "photo_urls": ["https://example.com/signed/a.jpg"],
            "input_meta": {"building_use": "주택"},
            "callback_url": None,
        },
    )


def test_create_requires_api_key(client):
    r = client.post("/v1/jobs", json={"photo_urls": ["https://x/a.jpg"]})
    assert r.status_code == 401


def test_create_job_runs_to_done_with_valid_report(client):
    r = _create(client)
    assert r.status_code == 202
    job = r.json()
    assert job["status"] == "queued"
    assert job["model_version"].endswith("+mock")

    done = wait_for_status(client, job["id"], "done")
    report = done["result"]
    assert report is not None
    # 스키마 계약: 필수 최상위 필드
    for field in ("site_summary", "materials", "hazards", "process_steps", "waste_plan", "disclaimer"):
        assert field in report
    # 석면 의심 자재 → hazards 에 ASBESTOS_SUSPECT + 전문 조사 안내
    assert any(h["type"] == "ASBESTOS_SUSPECT" for h in report["hazards"])
    # 올바로 판정 필드 존재
    assert isinstance(report["waste_plan"]["allbaro_manifest_required"], bool)
    # 공정 안전 지침은 RAG 지식베이스(kb_sources)에서 인용되어야 한다(§3.4)
    guidelines = report["process_steps"][0]["safety_guidelines"]
    assert guidelines and "샘플" in guidelines[0]["source_document"]


def test_get_missing_job_404(client):
    r = client.get("/v1/jobs/does-not-exist", headers={"X-API-Key": API_KEY})
    assert r.status_code == 404


def test_photo_count_limit(client):
    r = client.post(
        "/v1/jobs",
        headers={"X-API-Key": API_KEY},
        json={"photo_urls": [f"https://x/{i}.jpg" for i in range(11)]},
    )
    assert r.status_code == 422


def test_empty_photos_rejected(client):
    r = client.post("/v1/jobs", headers={"X-API-Key": API_KEY}, json={"photo_urls": []})
    assert r.status_code == 422


def test_admin_reload_requires_admin_key(client):
    r = client.post("/admin/reload", headers={"X-API-Key": API_KEY}, json={"model_adapter_hash": "v2"})
    assert r.status_code == 401

    r2 = client.post(
        "/admin/reload",
        headers={"X-API-Key": ADMIN_KEY},
        json={"model_adapter_hash": "v2"},
    )
    assert r2.status_code == 200
    assert r2.json()["model_version"].endswith("+v2")
