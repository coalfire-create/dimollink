# 모니터링 · 알림

앱은 `GET /api/metrics`(Prometheus 텍스트, `x-admin-token` 보호)와 헬스체크를 제공한다.
템플릿: `deploy/monitoring/`.

## 노출 메트릭

| 메트릭 | 타입 | 의미 |
|---|---|---|
| `http_requests_total{method,status}` | counter | 요청 수(상태등급 2xx/4xx/5xx) |
| `http_request_duration_ms_sum` / `_count` | summary | 지연 합/개수 → 평균 = sum/count |
| `process_uptime_seconds` | gauge | 가동 시간 |
| `up{job="dimol-api"}` | (Prometheus 생성) | 스크레이프 성공 여부 |

## 스크레이프 인증 (중요)

Prometheus 는 스크레이프에 임의 헤더(`x-admin-token`)를 넣지 못한다. 두 방법 중 택1:

1. **리버스 프록시 주입(권장)**: `deploy/monitoring/metrics-proxy.nginx.conf` 가 헤더를 주입하고 내부에서만 노출. Prometheus 는 프록시를 스크레이프한다.
2. **네트워크 격리**: `/api/metrics` 를 사설 네트워크/사이드카로만 노출하고 IP 허용목록으로 보호(프록시가 여전히 헤더 필요).

## 구성 절차

1. `deploy/monitoring/prometheus.yml`, `dimol-alerts.yml`, `alertmanager.yml`, `metrics-proxy.nginx.conf` 를 배치.
2. 시크릿 주입: `ADMIN_TOKEN`(프록시), `SLACK_WEBHOOK_URL`(alertmanager), `GRAFANA_ADMIN_PASSWORD`.
3. 단독 스택은 `docker-compose.yml` 로 기동하거나, 관리형(Grafana Cloud/AMP)에 규칙 이관.
4. 알림 규칙(`dimol-alerts.yml`): 인스턴스 다운·5xx율·평균지연·4xx급증·크래시루프.

## 레디니스 프로빙(선택)

`/api/health/ready` 를 blackbox exporter 로 프로빙(주석 예시 `prometheus.yml` 참고)하거나
로드밸런서 헬스체크로 사용한다. 헬스체크 경로는 앱에서 레이트리밋 예외 처리되어 있다.

## 로그

앱은 `[req] <request-id> <method> <path> <status> <ms>` 형식의 구조적 접근 로그를 남긴다
(쿼리/본문/시크릿 제외). 로그 수집기(예: Loki/CloudWatch)에서 `request-id` 로 상관 검색한다.
