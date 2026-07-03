# 연동 운영 전환 — PortOne(결제/정산) · 올바로(환경부)

CLAUDE.md 절대 규칙: **반드시 샌드박스/테스트로 먼저 검증한 뒤 운영 전환**한다. 앱은
안전장치로 명시적 플래그가 없으면 운영/실거래 호출을 거부한다.

## PortOne (결제 · 정산 · 지급대행 · 세금계산서)

관련 env: `PORTONE_API_SECRET`, `PORTONE_STORE_ID`, `PORTONE_ENV`(test|live), `PORTONE_ALLOW_LIVE`.

### 테스트(먼저)
- `PORTONE_ENV=test`, `PORTONE_ALLOW_LIVE=false`(기본).
- 검증 시나리오(전부 사람 diff 검토 대상):
  - 선결제(prepay): **수락된 견적 기준 금액**으로 청구되는지(클라이언트 금액 무시 확인).
  - 정산(payouts): D+1 영업일·공휴일 순연, 셀러별 수수료 7% 차감.
  - 취소/환불(cancel): 배차 전 전액 / 배차 후 위약금 10% / 작업 후 불가.
  - 세금계산서: 정산 확정 시 전자세금계산서 발행.

### 운영 전환(검증 완료 후에만)
1. 운영 `PORTONE_API_SECRET`/`STORE_ID` 발급·주입.
2. `PORTONE_ENV=live` **및** `PORTONE_ALLOW_LIVE=true` (둘 다여야 실거래 호출).
3. 소액 실거래 1건으로 결제→정산→취소 왕복 확인 후 오픈.

## 올바로 (회원검증 · 전자인계서)

관련 env: `ALLBARO_API_BASE_URL`, `ALLBARO_API_KEY`, `ALLBARO_ENV`(sandbox|production), `ALLBARO_ALLOW_PRODUCTION`.

### 샌드박스(먼저)
- `ALLBARO_ENV=sandbox`, `ALLBARO_ALLOW_PRODUCTION=false`(기본).
- 검증: 사업자 회원검증(가입 시 실시간), 전자인계서 자동 발행, API 장애 시 간이확인서 폴백 + 재시도 큐.
- 가입 검증 정책: 형식 불량=차단, 미회원=거부, **장애=미인증 가입 진행(관리자 승인이 백스톱)**.

### 운영 전환(검증 완료 후에만)
1. 올바로 운영 API 키/인증서 발급·주입(키·인증서는 `.env`/시크릿 매니저에만).
2. `ALLBARO_ENV=production` **및** `ALLBARO_ALLOW_PRODUCTION=true`.
3. 실제 소량 건으로 회원검증·인계서 발행 확인.

## 공통 주의

- 시크릿(키/인증서/PG시크릿)은 코드·커밋·로그·프롬프트에 넣지 않는다. 시크릿 매니저 사용.
- 재시도 큐(전자인계서)·지급대행은 **관리자 토큰 전용** 엔드포인트 — 스케줄러가 `x-admin-token`으로 호출.
- 운영 키로 첫 테스트 금지. 항상 샌드박스/테스트 → 운영 순서.
