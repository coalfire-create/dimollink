# Supabase Edge Functions — 디몰비전 중계 (기획서 §3.2)

프론트(vision-web)와 AI 서버(vision-api) 사이를 잇는다. 프론트는 AI 서버를 직접 호출하지 않고(§3.1),
AI 서버 엔드포인트·키는 이 함수들(서버)만 안다.

> ⚠️ 미배포·미검증 골격(Deno 미설치 환경에서 작성). `supabase functions deploy` 로 배포하고
> 스테이징에서 검증해야 한다. 문법은 esbuild 로만 확인했다.

## 함수

| 함수 | 인증 | 역할 |
|---|---|---|
| `sign-upload` | 사용자 JWT | 사진 업로드용 서명 URL 발급(비공개 버킷, 키 `<user_id>/<uuid>.<ext>`) |
| `create-analysis` | 사용자 JWT | `analyses` 생성 + `analysis_images` 기록 → 서명 다운로드 URL 로 vision-api `POST /v1/jobs` 트리거 |
| `analysis-callback` | **X-Callback-Secret** | vision-api 진행/결과 콜백 수신 → service_role 로 `analyses` 갱신(→ Realtime 반영) |

## 흐름 (§3.2)

```
브라우저 → sign-upload → (Storage 직접 업로드) → create-analysis
                                                      │
                                          analyses(queued) insert
                                                      │
                                       vision-api POST /v1/jobs (콜백 URL 포함)
                                                      │  (30초~2분)
                              vision-api → analysis-callback → analyses UPDATE
                                                      │
                              브라우저 Realtime 구독으로 stage/result 즉시 반영
```

## verify_jwt (중요)

`analysis-callback` 은 vision-api 가 호출하는 **서버-서버** 함수라 Supabase JWT 가 없다.
반드시 JWT 검증을 끄고 자체 시크릿으로만 보호한다. `supabase/config.toml` 에:

```toml
[functions.sign-upload]
verify_jwt = true
[functions.create-analysis]
verify_jwt = true
[functions.analysis-callback]
verify_jwt = false   # X-Callback-Secret 로 대신 보호
```

## 필요한 시크릿 (`supabase secrets set`)

| 키 | 용도 |
|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | 함수 런타임(플랫폼 기본 주입) |
| `VISION_API_URL` / `VISION_API_KEY` | AI 서버 트리거 |
| `VISION_CALLBACK_SECRET` | 콜백 검증(vision-api 의 VISION_CALLBACK_SECRET 와 동일) |
| `VISION_PHOTO_BUCKET` | 비공개 사진 버킷명(기본 `vision-site-photos`) |
| `VISION_SIGNED_URL_TTL` / `VISION_MAX_PHOTOS` | 서명 URL 유효시간(초) / 사진 상한 |

버킷 `vision-site-photos` 는 **비공개**로 만들고 `../README.md` 의 Storage RLS 정책을 적용한다.
