#!/usr/bin/env bash
# PostgreSQL 복원 — pg-backup.sh 로 만든 -Fc 덤프를 복원한다.
# ⚠️ 대상 DB 의 데이터를 덮어쓴다(--clean). 반드시 복원 대상을 확인하고 실행할 것.
#
# 사용: DATABASE_URL=postgres://... ./pg-restore.sh /path/to/dimol-YYYYmmdd-HHMMSS.dump
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL 필요}"
DUMP="${1:?복원할 덤프 파일 경로를 인자로 주세요}"
[[ -f "$DUMP" ]] || { echo "덤프 파일 없음: $DUMP" >&2; exit 1; }

echo "[restore] 대상: ${DATABASE_URL%%\?*}"
echo "[restore] 파일: ${DUMP}"
read -r -p "정말 복원하시겠습니까? 대상 데이터가 덮어써집니다 (yes 입력): " confirm
[[ "$confirm" == "yes" ]] || { echo "취소됨"; exit 1; }

# --clean --if-exists: 기존 객체 정리 후 복원. -j 4: 병렬.
pg_restore --clean --if-exists --no-owner -j 4 -d "$DATABASE_URL" "$DUMP"
echo "[restore] 완료"

# 복구 후 점검(예): 세션 테이블 등은 Redis 이므로 재로그인 필요.
# 관리형 DB 라면 PITR(특정 시점 복구)을 우선 사용하고 이 논리 복원은 최후 수단으로.
