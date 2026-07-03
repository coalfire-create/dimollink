# 디몰링크 상용 오픈 실행 가이드 (외부 액션 How-To)

코드는 "키·규격만 넣으면 동작"하는 상태입니다. 이 문서는 코드 밖에서 해야 하는 외부 액션을
**실제로 어떻게 하는지** 단계별로 정리한 것입니다.
- 무엇을 / 어디서 / 필요서류 / 앱에 반영하는 법(env·코드 위치) / 검증 순으로 기술.
- "무엇을"의 요약 체크리스트는 [legal/go-live-checklist.md](legal/go-live-checklist.md), 인프라 상세는
  [infra/](infra/README.md), 배포 템플릿은 리포 루트 `deploy/` 참조.

> 공통 규칙: 시크릿(키·인증서·시크릿)은 코드·커밋·로그·이 문서에 넣지 말 것. 배포 플랫폼의
> 시크릿 매니저/환경변수에만 주입한다. 올바로·PortOne 은 **반드시 샌드박스/테스트로 검증 후**
> 운영 전환(각각 `*_ALLOW_PRODUCTION` / `*_ALLOW_LIVE` 이중 플래그).

권장 순서: ① 인프라(DB/Redis) → ② SMS/지오코딩 → ③ PortOne → ④ 올바로 → ⑤ 도메인/TLS/WAF/모니터링 →
⑥ 법무 → ⑦ 업체 온보딩 → ⑧ 앱 심사 → ⑨ 최종 검증.

---

## 1. 관리형 PostgreSQL · Redis 프로비저닝

**왜**: 서버리스/다중 인스턴스에서 데이터·세션이 유지되려면 필수(현재 미설정 시 JSON 파일 폴백).

**어디서(예)**: PostgreSQL — AWS RDS / Google Cloud SQL / Supabase / Neon. Redis — AWS ElastiCache /
Upstash / Redis Cloud.

**단계**
1. PostgreSQL 인스턴스 생성(백업/PITR 활성화), 접속 문자열 확보.
2. Redis 인스턴스 생성(TLS 지원 권장), 접속 문자열 확보.
3. 앱 반영(env):
   - `DATABASE_URL=postgres://user:pass@host:5432/db`
   - `REDIS_URL=redis://:pass@host:6379`
   - 스키마(`kv_collections`)는 **최초 기동 시 자동 생성**(별도 마이그레이션 불필요).
4. 검증: 기동 로그에 `저장소: PostgreSQL`, `공유 상태: Redis (세션·OTP·레이트리밋)` 출력 확인.
   `GET /api/health/ready` 200.

**앱 코드 위치**: `apps/api/src/lib/pg-collection.ts`, `apps/api/src/lib/redis.ts`.

---

## 2. SMS 발송사 · 카카오 지오코딩 키

**왜**: OTP 실발송(미설정 시 서버 콘솔 폴백), 주소→좌표 거리매칭.

**SMS(예: NHN Cloud/네이버 SENS/Solapi 등)**
1. 발송사 가입·계약, **발신번호 사전등록**(통신사 심의, 수일 소요).
2. REST 발송 API 엔드포인트·키 확보.
3. 앱 반영: `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER`(발신번호).
4. 공급사 스펙이 `{ to, from, text }`와 다르면 `apps/api/src/auth/sms-sender.ts`의 `HttpSmsSender`
   바디를 조정.
5. 검증: 실제 번호로 OTP 요청 → 문자 수신.

**카카오 로컬(지오코딩)**
1. Kakao Developers 앱 생성 → **REST API 키** 발급.
2. 앱 반영: `GEOCODE_PROVIDER=kakao`, `KAKAO_REST_API_KEY=...`.
3. 검증: 요청 생성 시 주소가 좌표로 변환되어 업체 일감이 거리순 정렬(`거리 N km` 표시).

**앱 코드 위치**: `apps/api/src/auth/sms-sender.ts`, `apps/api/src/geo/geocoder.ts`.

---

## 3. 포트원(PortOne) — 결제·정산·지급대행·세금계산서

**왜**: 선결제·D+1 정산·전자세금계산서. 마켓플레이스 지급대행 계약 필요.

**필요서류/준비**: 사업자등록증, 통장 사본, 대표자 정보, 정산 대상(운반업체·처리장·철거업체)의
사업자·계좌 정보(지급대행 등록).

**단계**
1. 포트원 가입 → **지급대행/파트너 정산** 상품 신청 및 심사(가맹 심사, 영업일 소요).
2. **테스트 모드** 키(`API_SECRET`, `STORE_ID`) 발급.
3. 앱 반영(테스트): `PORTONE_API_SECRET`, `PORTONE_STORE_ID`, `PORTONE_ENV=test`, `PORTONE_ALLOW_LIVE=false`.
4. **실제 스펙 확정**: 포트원 SDK/문서에 맞춰 엔드포인트·필드 확정 — `apps/api/src/payment/portone-client.ts`
   의 경로/요청·응답 필드는 임시 가정이므로 실제 규격으로 교체(사람 diff 검토 영역).
5. 테스트 검증 시나리오(전부 사람 검토): 선결제(가상계좌/카드) → 작업완료 → 지급대행 →
   세금계산서 발행 → 취소/환불(전액/위약금10%).
6. **운영 전환**: 실 키 주입 + `PORTONE_ENV=live` **및** `PORTONE_ALLOW_LIVE=true`(둘 다여야 실거래).
   소액 실거래 1건 왕복 확인 후 오픈.

**앱 코드 위치**: `apps/api/src/payment/portone-client.ts`, `payment-service.ts`, `routes/payments.ts`.
자세한 절차: [legal/go-live-integrations.md](legal/go-live-integrations.md).

---

## 4. 환경부 올바로 API — 회원검증·전자인계서

**왜**: 사업자 회원검증(가입 시)·전자인계서 자동 발행. 현재 코드는 **가정 규격**이라 실규격 반영 필요.

**단계**
1. 한국환경공단/올바로시스템에 **연계(Open API) 사용 신청** → 승인 및 **연동 규격서·인증정보** 수령
   (기관 절차, 리드타임 김).
2. 샌드박스/테스트 계정 확보.
3. 앱 반영(샌드박스): `ALLBARO_API_BASE_URL`, `ALLBARO_API_KEY`, `ALLBARO_ENV=sandbox`,
   `ALLBARO_ALLOW_PRODUCTION=false`.
4. **실규격 반영**: `apps/api/src/allbaro/spec.ts`의 `AllbaroApiSpec`를 실제 규격대로 구현한 객체를
   만들어 `AllbaroClient`에 주입(엔드포인트·요청/응답 필드·회원유형 코드). **클라이언트 로직은 불변**.
5. 검증: 샌드박스로 회원검증(가입 실시간), 전자인계서 발행, 장애 시 간이확인서 폴백·재시도 큐.
6. **운영 전환**: 운영 키/인증서 주입 + `ALLBARO_ENV=production` **및** `ALLBARO_ALLOW_PRODUCTION=true`.

**앱 코드 위치**: `apps/api/src/allbaro/spec.ts`(교체 지점), `client.ts`, `manifest-service.ts`.

---

## 5. 도메인 · TLS · CDN · WAF · 모니터링 · 백업

**단계**
1. 도메인 구입, DNS 설정. 웹/API 호스팅(예: Vercel — 리포 연결, 환경변수 등록).
2. TLS: 플랫폼 자동 인증서 + HTTP→HTTPS 강제(운영 모드에서 앱이 HSTS 응답).
3. CDN/WAF: 상세 [infra/edge-security.md](infra/edge-security.md) — 관리형 룰셋 + 엣지 레이트리밋,
   백오피스/`/api/metrics` 경로 IP 제한, `CORS_ORIGINS`와 엣지 CORS 일치.
4. 모니터링/알림: `deploy/monitoring/*` 배치(Prometheus 규칙은 앱 메트릭 기준), 상세
   [infra/monitoring.md](infra/monitoring.md). `/api/metrics`는 `x-admin-token` 보호 →
   `metrics-proxy`로 스크레이프.
5. 백업 크론: `deploy/scripts/pg-backup.sh`(야간, S3 오프사이트), 상세 [infra/backup-restore.md](infra/backup-restore.md).
6. 운영 필수 env: `NODE_ENV=production`, `CORS_ORIGINS`, `ADMIN_TOKEN`(미설정 시 기동 중단).

---

## 6. 법무 — 약관 · 방침 · 신고

**단계**
1. 초안(`docs/legal/`)을 **변호사(개인정보·전자상거래·전자금융 전문) 검토**로 확정.
2. 위치기반서비스: 위치정보사업/위치기반서비스사업 **신고 필요 여부**를 방통위 기준으로 확인
   ([legal/location-terms.md](legal/location-terms.md)).
3. 통신판매업 신고, 전자상거래 필수 고지, 개인정보 보호책임자 지정, 수탁사별 처리위탁 계약.
4. 앱 반영: 약관/방침 **공개 URL**을 앱·스토어에 연결, 앱 내 위치·개인정보 **동의 UI** 및
   **회원 탈퇴/계정 삭제** 경로 확인(스토어 요구).

---

## 7. 파일럿 업체 온보딩 (Phase 0)

**단계**
1. 운반업체 5곳·처리장 3곳·철거업체 파트너와 계약(정산계좌·사업자·올바로 회원 확인).
2. 각 업체를 앱 회원가입(휴대폰 OTP)시키고, **관리자 화면에서 승인**(x-admin-token → 승인 대기 → 승인).
3. 포트원 지급대행 정산 대상으로 등록.
4. 양평·건설폐기물 시범 거래 1~2건으로 전체 흐름(요청→매칭→결제→작업→정산) 실검증.

---

## 8. 앱스토어 · 플레이 심사

**단계**
1. Apple Developer / Google Play Console 계정 준비.
2. EAS 빌드: `eas build -p ios`, `eas build -p android` → `eas submit`.
3. 서명: iOS 인증서/프로비저닝, Android 키스토어(EAS 관리 가능).
4. 등록 정보·스크린샷·개인정보/위치 문구·계정삭제 경로: [legal/app-store-listing.md](legal/app-store-listing.md).
5. 웹 빌드: `npm run build -w @dimol/mobile`(expo export web) → 정적 호스팅(`vercel.json` 연동).

---

## 9. 최종 검증 (오픈 직전)

- [ ] 실기기(iOS/Android) 전체 플로우 + **고령 접근성**(글자 18px+/버튼 48px+/문구) 확인.
- [ ] 샌드박스→운영 전환 검증 완료(PortOne·올바로, 사람 diff 검토).
- [ ] 부하 테스트(예상 트래픽), 외부 **보안 점검/모의해킹**(결제·PII).
- [ ] 헬스체크(`/api/health/ready`)·메트릭·알림·백업 동작 확인.
- [ ] 롤백 계획(이전 배포로 복귀), 장애 대응·CS·환불 SOP.

---

## 부록 — 운영 env 요약 (반드시 시크릿 매니저로)

| 변수 | 용도 | 미설정 시 |
|---|---|---|
| `NODE_ENV=production` | 운영 모드 | 개발 모드 |
| `CORS_ORIGINS` | 허용 출처 | **운영 기동 중단** |
| `ADMIN_TOKEN` | 백오피스·정산 | **운영 기동 중단** |
| `DATABASE_URL` | PostgreSQL | JSON 파일 폴백 |
| `REDIS_URL` | 세션·OTP·레이트리밋 공유 | 인메모리(단일 인스턴스) |
| `SMS_API_URL/KEY/SENDER` | OTP 발송 | 콘솔 폴백 |
| `GEOCODE_PROVIDER=kakao`,`KAKAO_REST_API_KEY` | 지오코딩 | 좌표 없음 |
| `PORTONE_*`,`PORTONE_ALLOW_LIVE` | 결제/정산 | 호출 불가 |
| `ALLBARO_*`,`ALLBARO_ALLOW_PRODUCTION` | 올바로 | 호출 불가 |

전체 예시: `apps/api/.env.example`.
