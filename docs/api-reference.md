# 디몰링크 API 레퍼런스 (Phase 1~6)

Base URL: `http://localhost:4000/api` (포트는 `.env`의 `PORT`)

프론트(안티그래비티 작업분)는 타입·상수를 `@dimol/shared` 에서 import 해서 쓴다.
요청 저장·상태 관리의 상세(생성 필드, 상태 흐름, 사진 업로드 연계)는 `docs/api-requests.md` 참고.
오류 응답은 공통으로 `4xx { "error": "<한글 사유>" }` — 사유는 사용자에게 그대로 노출 가능한 문구다.

## 엔드포인트 총람

### 기반 (Phase 0~1)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 서버 상태 |
| POST | `/uploads/site-photos/presign` | 현장 사진 업로드 presigned URL 발급 |
| POST | `/requests` · GET `/requests`, `/requests/:id` | 서비스 요청 3종 생성/조회 (`api-requests.md`) |
| PATCH | `/requests/:id/status` | 상태 전이 (전이 규칙은 shared) |
| POST | `/requests/:id/site-photos` | 사진 키 추가 연결 |
| POST | `/users` · GET `/users`, `/users/:id` · PATCH `/users/:id` | 온보딩(배출자 즉시 승인, 업체는 PENDING)·프로필 |
| POST | `/matching/rank` | 거리순 후보 정렬 |
| POST | `/allbaro/*` | 올바로 회원 검증·전자인계서 (민감 영역 — 사람 검토 후 반영) |
| POST | `/payments/*` | 포트원 결제 (민감 영역 — 사람 검토 후 반영) |

### Phase 2 — 신뢰 구축

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/reviews` | 리뷰 작성 `{ requestId, raterId, rating(1~5), comment? }` — 완료(COMPLETED/SETTLED)된 요청의 당사자만, 요청당 1회 |
| GET | `/reviews?ratedId=&requestId=` | 리뷰 목록 (최신순) |
| GET | `/users/:id/rating` | 평점 요약 `{ average, reviewCount, noShowCount, disputeCount }` |
| POST | `/incidents` | 노쇼/분쟁 신고 `{ requestId, reporterId, type: NO_SHOW\|DISPUTE, detail? }` |
| GET | `/incidents?targetId=&status=` | 신고 이력 |
| PATCH | `/users/:id/certifications` | 보험·허가증 등록 `{ insuranceRegistered?, permitRegistered? }` (업체만) |

### Phase 3 — 매칭 고도화

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/matching/recommend` | 가중치 추천 정렬. body: `{ origin, candidates: [{ …, price?, rating? }], weights?: { distance?, price?, rating? } }`. 가중치 기본값 `DEFAULT_MATCH_WEIGHTS`(거리 0.5/가격 0.3/평점 0.2). `rating` 미지정 후보는 서버가 리뷰 평점으로 자동 채움 |
| POST | `/quotes` | 견적 제시 `{ requestId, providerId, party, amount, memo? }` (REQUESTED 상태만, 재견적 허용=히스토리) |
| GET | `/quotes?requestId=&providerId=&party=` | 견적 히스토리 (최신순) |
| GET | `/quotes/market-rate?party=` | 평균 시세 `{ averageAmount, min/max, averagePerTon }` |
| POST | `/offers` | 매칭 제안 `{ requestId, providerId, ttlMinutes? }` (기본 30분, 요청당 활성 1건) |
| POST | `/offers/:id/accept` · `/decline` | 업체 응답. 수락 시 요청이 MATCHED 로 전이 |
| POST | `/offers/sweep` | 만료 스윕 — 응답 시간 초과 건 반환 (재매칭 트리거) |
| GET | `/offers?requestId=&providerId=&status=` | 제안 목록 |

### Phase 4 — 운영 도구

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/notifications?userId=` | 인앱 알림함 (상태 전이 시 자동 발송, 최신순) |
| PUT | `/requests/:id/location` | 위치 갱신 `{ providerId, lat, lng }` — 진행중(IN_PROGRESS) + 매칭 업체만 |
| GET | `/requests/:id/location` | 최신 위치 `{ sharing, … }` — 작업 종료 시 `sharing: false` |
| POST | `/requests/:id/messages` | 채팅 발신 `{ senderId, content }` (매칭 확정 후 당사자만, 최대 1000자) |
| GET | `/requests/:id/messages?viewerId=&since=` | 대화 내역 (오래된 순, `since` 이후만 — 폴링용) |

### Phase 5 — 백오피스 (`x-admin-token` 헤더 필수, `ADMIN_TOKEN` 미설정 시 전체 503)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/admin/users?approvalStatus=PENDING` | 승인 대기 업체 큐 |
| PATCH | `/admin/users/:id/approval` | `{ status: APPROVED\|SUSPENDED\|PENDING }` |
| GET | `/admin/incidents?status=OPEN` | 분쟁 조정 큐 |
| POST | `/admin/incidents/:id/resolve` | `{ resolutionNote? }` |
| GET | `/admin/requests?status=` · `/admin/offers?status=` | 매칭 현황/제안 로그 |
| GET | `/admin/anomalies` | 이상거래 탐지 (반복 매칭 쌍 ≥3회, 시세 ±50% 편차 견적) |

### Phase 6 — 고도화

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/estimation/volume` | 물량 추정 `{ floorAreaM2, structure?: RC\|BRICK\|WOOD }` → `{ estimatedTons, confidence, disclaimer }`. AI 연동 전 원단위 목 — `disclaimer` 를 반드시 함께 노출할 것 |
| GET | `/allbaro/manifest/failures` | 재시도 소진(EXHAUSTED) 건 목록 (민감 영역) |
| POST | `/allbaro/manifest/failures/:id/retry` | 소진 건 수동 재처리 (민감 영역) |

## 프론트 구현 메모

- **디자인 토큰**: 글자/터치/여백/색상은 `@dimol/shared` 의 `FONT_SIZES`, `TOUCH`, `SPACING`, `COLORS` 만 사용 (기본 텍스트 18px+, 버튼 48px+, 여백 8px 배수, 메인+보조 2색).
- **알림**: 상태 전이 시 서버가 자동 생성한다. 프론트는 `/notifications?userId=` 폴링(또는 화면 진입 시 조회)만 하면 된다. 실 푸시/문자는 provider 계약 후 서버측 교체 예정.
- **채팅/위치**: 파일럿은 폴링 기반. 채팅은 `since` 파라미터로 증분 조회.
- **추천 정렬**: 화면에서 `score` 순으로 그대로 렌더. `rating: null` 은 "평점 없음"으로 표기.
- **평균 시세**: 요청 작성 화면에서 `market-rate` 를 조회해 "최근 평균 ○○원" 안내에 사용. `quoteCount` 가 적으면(예: 5건 미만) 안내를 숨길 것.
