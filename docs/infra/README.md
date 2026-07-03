# 디몰링크 인프라 가이드

코드로는 완료했고, 배포 플랫폼에서 설정해야 하는 운영 항목의 가이드·템플릿 모음.
템플릿 실체는 리포 루트 `deploy/` 에 있다.

| 영역 | 가이드 | 템플릿 |
|---|---|---|
| 모니터링/알림 | [monitoring.md](monitoring.md) | `deploy/monitoring/*` |
| 백업/복구 | [backup-restore.md](backup-restore.md) | `deploy/scripts/pg-*.sh` |
| 엣지 보안(WAF/CDN/TLS) | [edge-security.md](edge-security.md) | (플랫폼 콘솔/Terraform) |
| 연동 운영 전환(PortOne/올바로) | [go-live-integrations.md](go-live-integrations.md) | `apps/api/.env.example` |

## 전제 (앱이 이미 제공)

- 환경변수: `apps/api/.env.example` (DB/Redis/SMS/지오코딩/PG/올바로/CORS/ADMIN 등)
- 헬스체크: `GET /api/health/live`, `GET /api/health/ready`
- 메트릭: `GET /api/metrics` (x-admin-token, Prometheus 텍스트)
- 추적: 모든 응답 `X-Request-Id`
- 레이트리밋: 전역 300/분 + 인증 20/분 (Redis 설정 시 인스턴스 공유)
- 배포: `vercel.json`(웹+API) 또는 `node apps/api/dist/index.js`

## 우선순위(권장 순서)

1. 관리형 PostgreSQL + Redis 프로비저닝 → `DATABASE_URL`/`REDIS_URL`
2. TLS 종단 + CDN/WAF (edge-security)
3. 모니터링/알림 (monitoring)
4. 백업 크론 (backup-restore)
5. PortOne/올바로 샌드박스 검증 → 운영 전환 (go-live-integrations)
