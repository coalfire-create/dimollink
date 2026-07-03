# 백업 · 복구

디몰링크의 영속 데이터는 PostgreSQL(`DATABASE_URL`)에 있다. 세션·OTP·레이트리밋은 Redis
(휘발성, 백업 불필요 — 유실 시 재로그인). 현장 사진은 S3 호환 스토리지(버킷 버저닝 권장).

## 2단 방어선

1. **관리형 DB 자동 백업/PITR(1차)**: RDS/Cloud SQL/Supabase 등의 자동 스냅샷 + Point-in-Time Recovery 활성화. 실수·장애 복구의 기본.
2. **오프사이트 논리 백업(2차)**: `deploy/scripts/pg-backup.sh` 로 야간 `pg_dump`(-Fc) → S3 업로드. 리전/계정 장애 대비.

## 설정

```bash
# 크론(매일 03:00)
0 3 * * *  DATABASE_URL=postgres://... S3_BUCKET=dimol-backups \
  /opt/dimol/deploy/scripts/pg-backup.sh >> /var/log/dimol-backup.log 2>&1
```

- `BACKUP_RETENTION_DAYS`(기본 14) 로 로컬 보관 정리.
- S3 버킷은 비공개 + 버전관리 + 수명주기(Glacier 이관) 권장.

## 복구

```bash
DATABASE_URL=postgres://... ./deploy/scripts/pg-restore.sh /path/dimol-YYYYmmdd-HHMMSS.dump
```

- 우선순위: 관리형 **PITR**(특정 시점) > 논리 덤프 복원(최후 수단, `--clean`으로 덮어씀).
- 복구 후: Redis 세션은 별개이므로 사용자 재로그인 필요. 결제/정산 정합성은 PortOne 대시보드와 대조.

## 점검(분기별 권장)

- 복원 리허설: 백업본을 스테이징 DB에 복원해 무결성 확인(백업이 "복원 가능"한지 실제 검증).
- 스토리지: S3 버킷 버저닝/수명주기 동작 확인.
