# 백업 · 복구

디몰링크의 영속 데이터는 PostgreSQL(`DATABASE_URL`)의 **`entities` 한 테이블**에 전부 들어 있다
(collection + id + JSONB). 세션·OTP·레이트리밋은 휘발성이라 백업하지 않는다(유실 시 재로그인).
현장 사진은 별도 S3 버킷(`dimol-site-photos`).

---

## 지금 돌고 있는 것 (2026-09-23 ~)

**매일 KST 04:00, 서버가 스스로 백업한다.** 크론 서버도, 사람이 누를 버튼도 필요 없다.

| 항목 | 값 |
|---|---|
| 방식 | 앱 내 스케줄러(`db-backup` 작업) → `entities` 전체를 NDJSON + gzip 으로 덤프 |
| 보관 위치 | Railway 버킷 **`dimol-db-backups`**(싱가포르) · 키 `db/dimol-YYYYMMDD-HHMMSS.ndjson.gz` |
| 보관 기간 | 30일 (`BACKUP_RETENTION_DAYS`) — 단, **최신 1개는 기간이 지나도 지우지 않는다** |
| 실행 시각 | KST 04:00 (`BACKUP_HOUR_KST`) |
| 중복 방지 | 그날 날짜의 백업이 버킷에 이미 있으면 건너뛴다(재배포가 잦아도 하루 1개) |

### 왜 pg_dump 가 아닌가

데이터가 `entities` 한 테이블이고 스키마는 서버가 기동할 때 다시 만든다. 그래서 행만 있으면
복원이 끝난다. `pg_dump` 를 쓰려면 API 이미지에 postgres 클라이언트를 깔고 **서버와 메이저
버전을 맞춰야** 하는데(불일치면 덤프가 거부된다), 그 대가로 얻는 게 없다.

형식이 NDJSON 인 이유: 한 줄이 한 레코드라 덤프가 중간에 잘려도 그 줄까지는 살아남고,
복원도 한 줄씩 먹일 수 있다. 통짜 JSON 배열은 마지막 괄호가 없으면 전부 못 읽는다.

### ⚠️ 덤프에는 PII 가 평문으로 들어 있다

휴대폰번호·사업자등록번호가 그대로 있다. 그래서 **현장 사진 버킷과 분리**했다 —
앱이 presigned URL 발급에 쓰는 사진 버킷 키가 새더라도 백업까지 같이 새면 안 된다.
버킷·키 모두 별도(`BACKUP_*`)이고, 로그에는 건수·바이트만 남긴다.

---

## 확인하는 법

백업은 "돌고 있다고 믿었는데 실제로는 비어 있는 것"이 가장 흔한 실패다. 파일 목록을 직접 본다.

```bash
# 관리자 토큰으로 목록 조회 (최신 + 전체)
curl -s https://demolink-api-production.up.railway.app/api/admin/backups \
  -H "x-admin-token: $ADMIN_TOKEN" | python3 -m json.tool | head -20
```

응답은 키·크기·생성시각만 준다(내용은 절대 내려보내지 않는다).

```bash
# 지금 한 번 떠보기 (복원 리허설 전 최신본 확보 등)
curl -s -X POST https://demolink-api-production.up.railway.app/api/admin/backups \
  -H "x-admin-token: $ADMIN_TOKEN"
# → {"key":"db/dimol-...","rowCount":123,"bytes":45678}
```

`503 BACKUP_NOT_CONFIGURED` 가 나오면 `BACKUP_*` 변수가 빠진 것이다.

---

## 복구

```bash
# 1) 백업 파일 내려받기
railway bucket credentials --bucket dimol-db-backups --json   # 자격증명 확인
#    → aws s3 cp (endpoint 지정) 또는 Railway 대시보드에서 다운로드

# 2) 복원 (병합: 덤프에 있는 행만 덮어씀 — 기본)
DATABASE_URL=postgres://... node deploy/scripts/restore-db-backup.mjs ./dimol-20260923-040000.ndjson.gz

# 3) 통째 복구가 필요할 때만 (덤프에 없는 행까지 삭제)
DATABASE_URL=postgres://... node deploy/scripts/restore-db-backup.mjs --replace ./dump.ndjson.gz
```

- 기본이 병합인 이유: 사고 범위가 일부일 때 `--replace` 는 그 사이에 쌓인 정상 데이터까지
  날린다. 통째 복구는 의도를 밝혀야 한다.
- 전체가 트랜잭션 하나다 — 도중 실패하면 아무것도 바뀌지 않는다.
- 복구 후: 세션은 별개이므로 사용자 재로그인 필요. 결제·정산 정합성은 포트원 대시보드와 대조.

### 우선순위

1. **외부 DB 제공자의 PITR/스냅샷**(있다면) — 특정 시점으로 되돌릴 수 있어 가장 정밀하다.
2. 위 논리 백업 복원 — 리전·계정 장애, 테이블 통째 손상 대비.

---

## 점검 (분기 1회 권장)

- **복원 리허설**: 최신 덤프를 빈 스테이징 DB 에 `--replace` 로 복원해 보고, 로그인·요청 목록이
  뜨는지 확인한다. 이걸 안 하면 "백업은 있는데 복원이 안 되는" 상태를 사고 당일에 알게 된다.
- 목록 조회로 최신 백업 날짜가 어제/오늘인지 확인.
- 외부 DB 제공자 콘솔에서 자동 백업이 켜져 있는지 확인.

---

## 예전 스크립트 (`pg-backup.sh` / `pg-restore.sh`)

별도 서버에 크론을 걸어 `pg_dump` 를 돌리는 방식. 지금은 쓰지 않지만, 앱 밖에서
전체 스키마까지 뜨고 싶을 때를 위해 남겨 둔다.
