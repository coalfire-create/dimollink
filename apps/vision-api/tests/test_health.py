def test_health_ok(client):
    r = client.get("/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["pipeline"] == "mock"
    assert body["model_version"].endswith("+mock")
    assert body["queue_length"] >= 0
