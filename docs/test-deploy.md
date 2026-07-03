# 테스트 배포(Vercel) 가이드

테스트용으로 Vercel에 올려 실제로 눌러보기 위한 최소 절차. 서버리스는 인스턴스가 매번 바뀌므로
**로그인(OTP·세션)이 유지되려면 Redis 가 필요**하고, 데이터 유지에는 Postgres 가 필요하다.
둘 다 무료 티어로 충분하다.

> ⚠️ 이건 **테스트 배포**다. `ALLOW_TEST_OTP`(마스터코드 로그인)와 `SEED_TEST_ACCOUNTS`는
> 테스트 전용이며 실서비스 전환 시 반드시 끈다.

## 0. 사전 준비 (무료 티어)

- **Upstash Redis**: [upstash.com](https://upstash.com) → Redis DB 생성 → `REDIS_URL`(rediss://...).
- **Neon Postgres**: [neon.tech](https://neon.tech) → 프로젝트 생성 → `DATABASE_URL`(postgres://...).
- Vercel 계정(이미 프로젝트 링크됨: 팀/프로젝트 "mobile").

## 1. Vercel 프로젝트 설정 확인 (중요)

Vercel 대시보드 → 프로젝트 Settings:
- **Root Directory**: 저장소 루트(비워두거나 `./`). `apps/mobile` 로 되어 있으면 루트로 변경해야
  `api/` 서버리스 함수와 루트 `vercel.json` 이 적용된다.
- Build/Output: 루트 `vercel.json` 이 처리(buildCommand·outputDirectory·rewrites). 대시보드에서
  override 되어 있으면 비활성화.

## 2. 환경변수 등록 (Vercel → Settings → Environment Variables)

| 변수 | 값(예) | 용도 |
|---|---|---|
| `DATABASE_URL` | postgres://... (Neon) | 데이터 유지 |
| `REDIS_URL` | rediss://... (Upstash) | 세션·OTP 유지(서버리스 필수) |
| `CORS_ORIGINS` | https://<배포도메인> | 운영 모드 기동 필수 |
| `ADMIN_TOKEN` | (임의 강한 문자열) | 백오피스·기동 필수 |
| `ALLOW_TEST_OTP` | true | 테스트 OTP 코드(123456) 허용 |
| `SEED_TEST_ACCOUNTS` | true | 테스트 계정 자동 생성 |

(선택) 실제 문자/좌표/결제까지 테스트하려면 `SMS_*`, `KAKAO_REST_API_KEY`, `PORTONE_*`(test)도 등록.
미등록 시 OTP 콘솔 폴백 → 하지만 `ALLOW_TEST_OTP=true`면 **코드 123456**으로 로그인되므로 문자 없이 테스트 가능.

## 3. 배포

로컬 CLI로(이미 링크됨):
```
! npx vercel login        # 최초 1회(브라우저 인증)
! npx vercel --prod       # 배포
```
또는 GitHub 리포를 Vercel에 연결해 push 시 자동 배포.

빌드는 `vercel.json` 의 buildCommand 가 shared→api→mobile(web) 순으로 수행한다.

## 4. 테스트 계정 (SEED_TEST_ACCOUNTS=true 시 자동 생성)

로그인: 아래 휴대폰번호 입력 → 인증코드 **123456**(ALLOW_TEST_OTP) 입력.

| 유형 | 휴대폰번호 |
|---|---|
| 소비자 | 010-1111-0001 |
| 철거업체 | 010-2222-0002 |
| 운반업체(콜대기 ON) | 010-3333-0003 |
| 처리장 | 010-4444-0004 |

관리자 화면: 시작 화면 하단 "관리자" → `ADMIN_TOKEN` 값 입력.

## 5. 확인

- `https://<도메인>/api/health/ready` → `{"status":"ready"}`
- 웹앱 접속 → 소비자로 로그인(010-1111-0001 / 123456) → 철거 요청 등록
- 철거업체(010-2222-0002)로 로그인 → 일감 수락(금액) → 다시 소비자로 결제
- 처리장(010-4444-0004)은 견적 제출, 요청자가 견적 비교·선택

## 문제 해결

- **로그인 안 됨/세션 끊김**: `REDIS_URL` 미설정이면 서버리스에서 세션이 유지되지 않는다 → Upstash 등록.
- **기동 실패(로그)**: 운영 모드는 `CORS_ORIGINS`·`ADMIN_TOKEN` 없으면 중단 → 등록 확인.
- **api 404**: Vercel Root Directory 가 루트인지, rewrites 가 적용됐는지 확인.
- **데이터가 사라짐**: `DATABASE_URL` 미설정이면 서버리스 파일저장은 휘발 → Neon 등록.
