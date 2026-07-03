# 디몰링크 상용 배포 가이드

상용 전환에 필요한 설정·절차·점검 목록. 시크릿은 절대 커밋하지 않는다(.env / 배포 플랫폼 시크릿에만).

## 1. 아키텍처

- **API**: Node/Express (`apps/api`). Vercel 서버리스(`api/index.js`) 또는 일반 Node 서버(`apps/api/dist/index.js`).
- **모바일/웹**: React Native + Expo. 웹은 `apps/mobile` → `expo export --platform web` → 정적 호스팅.
- **저장소**: `DATABASE_URL` 설정 시 PostgreSQL, 미설정 시 JSON 파일(.data, 개발용).
- **Vercel**: `vercel.json` 이 `/api/*` → `api/index.js`, 그 외 → `apps/mobile/dist` 정적 서빙.

## 2. 필수 환경변수 (운영)

`apps/api/.env.example` 참고. 운영에서 **미설정 시 서버가 기동을 거부**하는 항목:

| 변수 | 용도 |
|---|---|
| `NODE_ENV=production` | 운영 모드(마스터 OTP 무력화, HSTS 등) |
| `CORS_ORIGINS` | 허용 출처(콤마 구분). 미설정 시 기동 중단 |
| `ADMIN_TOKEN` | 백오피스·지급대행 보호. 미설정 시 기동 중단 |
| `DATABASE_URL` | PostgreSQL. 서버리스는 필수(임시 FS) |

권장(미설정 시 경고/폴백):

| 변수 | 미설정 시 |
|---|---|
| `SMS_API_URL`/`SMS_API_KEY`/`SMS_SENDER` | 콘솔 출력 폴백(실 발송 안 됨) |
| `GEOCODE_PROVIDER=kakao`/`KAKAO_REST_API_KEY` | 좌표 없이 진행(거리매칭 비활성) |
| `PORTONE_*` | 결제/정산/지급대행 호출 불가 |
| `ALLBARO_*` | 회원검증/전자인계서 호출 불가 |

## 3. 배포 절차

1. PostgreSQL 프로비저닝 → `DATABASE_URL` 설정. (스키마는 최초 기동 시 `kv_collections` 자동 생성)
2. `CORS_ORIGINS`, `ADMIN_TOKEN`, SMS/지오코딩/PortOne/올바로 키 설정.
3. 빌드: `npm ci && npm run build:shared && npm run build -w @dimol/api` (웹은 `npm run build -w @dimol/mobile`).
4. 배포(Vercel: 리포 연결 후 환경변수 등록). 일반 서버는 `node apps/api/dist/index.js`.
5. 헬스체크: `/api/health/live`(라이브니스), `/api/health/ready`(레디니스).

## 4. 운영 전 검증 (CLAUDE.md 규칙)

- **올바로**: `ALLBARO_ENV=sandbox` 로 회원검증·전자인계서 흐름 검증 → 완료 후에만 `ALLBARO_ENV=production` + `ALLBARO_ALLOW_PRODUCTION=true`.
- **포트원**: `PORTONE_ENV=test` 로 선결제·정산·지급대행·환불 검증 → 완료 후에만 `PORTONE_ENV=live` + `PORTONE_ALLOW_LIVE=true`.
- 결제/정산/세금계산서·올바로 연동 diff 는 사람이 직접 검토 후 반영.

## 5. 남은 하드닝(스케일 확장 시)

- **다중 인스턴스**: 세션·OTP·레이트리밋을 Redis 등 공유 저장소로. 현재 인메모리/단일 라이터 JSONB.
- **정산 금액 권위**: 선결제 금액을 클라이언트 입력이 아닌 서버(수락된 견적)에서 산출하도록 확정.
- **결제 취소 소유권**: paymentId ↔ 요청자 매핑 저장 후 취소 요청자 검증.
- 관측성(구조적 로깅/메트릭/알럿), 백업·복구, WAF/DDoS.

## 6. 인증 모델 요약

- 휴대폰 OTP 로그인 → 세션 토큰(Bearer). 모든 변경성/개인정보 엔드포인트는 토큰 필수, 리소스 소유자/참여자만 접근.
- 지급대행 등 백오피스성 작업은 `x-admin-token`(ADMIN_TOKEN) 전용.
- 운영에서 OTP 마스터코드는 자동 비활성. 인증 엔드포인트는 IP 레이트리밋.
