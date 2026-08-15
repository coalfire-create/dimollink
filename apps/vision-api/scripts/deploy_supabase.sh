#!/usr/bin/env bash
# 디몰비전 Supabase 실배포 (기획서 §3.2, §5.2). 스키마·Storage·Edge Functions·시크릿을 한 번에.
#
# 사전:
#   1) Supabase 프로젝트 생성(대시보드) → project-ref 확보
#   2) supabase CLI 설치: https://supabase.com/docs/guides/cli  (brew install supabase/tap/supabase)
#   3) supabase login  (액세스 토큰)
#   4) supabase/.env 작성(.env.example 참고) — 함수 시크릿
#
# 사용:
#   PROJECT_REF=abcd1234 ./scripts/deploy_supabase.sh
set -euo pipefail

cd "$(dirname "$0")/.."   # apps/vision-api

: "${PROJECT_REF:?PROJECT_REF 환경변수 필요 (Supabase 프로젝트 ref)}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "✗ supabase CLI 가 없습니다. 설치: brew install supabase/tap/supabase" >&2
  exit 1
fi

echo "▶ 1/4 프로젝트 링크: $PROJECT_REF"
supabase link --project-ref "$PROJECT_REF"

echo "▶ 2/4 스키마 마이그레이션 (0001 init · 0002 rls · 0003 storage)"
supabase db push

echo "▶ 3/4 Edge Functions 배포 (sign-upload · create-analysis · analysis-callback)"
# analysis-callback 만 verify_jwt=false (vision-api 서버→서버 콜백). 나머지는 JWT 필요.
supabase functions deploy sign-upload --project-ref "$PROJECT_REF"
supabase functions deploy create-analysis --project-ref "$PROJECT_REF"
supabase functions deploy analysis-callback --no-verify-jwt --project-ref "$PROJECT_REF"

echo "▶ 4/4 함수 시크릿 설정"
if [ -f supabase/.env ]; then
  supabase secrets set --env-file supabase/.env --project-ref "$PROJECT_REF"
else
  echo "  ⚠ supabase/.env 없음 — 시크릿 미설정. .env.example 로 만들어 다시 실행하세요." >&2
fi

echo "✓ Supabase 배포 완료. 다음: vision-web config(supabaseUrl/anonKey, mock=false) + GPU 서빙(training/SERVING.md)."
echo "  스모크 테스트는 docs/디몰비전_실운영_배포.md 참조."
