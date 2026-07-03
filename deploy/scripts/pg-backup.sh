#!/usr/bin/env bash
# PostgreSQL 백업 — 야간 크론용. 관리형 DB의 자동 스냅샷/PITR가 1차 방어선이고,
# 이 스크립트는 오프사이트(S3 등) 논리 백업 2차 방어선이다.
#
# 필요 env:
#   DATABASE_URL           postgres://user:pass@host:5432/db
#   BACKUP_DIR             로컬 임시 저장 경로 (기본 /var/backups/dimol)
#   BACKUP_RETENTION_DAYS  로컬 보관 일수 (기본 14)
#   S3_BUCKET              (선택) 업로드 대상. 미설정 시 로컬만.
#
# 크론 예: 0 3 * * *  /opt/dimol/deploy/scripts/pg-backup.sh >> /var/log/dimol-backup.log 2>&1
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL 필요}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/dimol}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TS="$(date +%Y%m%d-%H%M%S)"
FILE="${BACKUP_DIR}/dimol-${TS}.dump"

mkdir -p "$BACKUP_DIR"

# 커스텀 포맷(-Fc): 압축 + 병렬 복원 가능.
echo "[backup] pg_dump 시작 → ${FILE}"
pg_dump "$DATABASE_URL" -Fc -f "$FILE"
echo "[backup] 완료: $(du -h "$FILE" | cut -f1)"

# 오프사이트 업로드(선택).
if [[ -n "${S3_BUCKET:-}" ]]; then
  echo "[backup] S3 업로드 → s3://${S3_BUCKET}/pg/dimol-${TS}.dump"
  aws s3 cp "$FILE" "s3://${S3_BUCKET}/pg/dimol-${TS}.dump"
fi

# 로컬 보관 정리.
find "$BACKUP_DIR" -name 'dimol-*.dump' -mtime "+${RETENTION_DAYS}" -delete
echo "[backup] ${RETENTION_DAYS}일 초과 로컬 백업 정리 완료"
