# 서비스 요청 API (철거요청 / 운반요청 / 처리장예약)

프론트 화면(안티그래비티 작업분)이 사용하는 요청 저장·상태 관리 API.
Base URL: `http://localhost:4000/api` (포트는 `.env`의 `PORT`)

타입·상태 상수는 `@dimol/shared` 를 import 해서 그대로 쓸 것
(`ServiceRequest`, `RequestKind`, `REQUEST_STATUS_LABELS`, `isRequestCancellable` 등).
서버와 프론트가 같은 전이 규칙을 공유해야 버튼 노출과 API 거부가 어긋나지 않는다.

## 상태 흐름

```
REQUESTED(대기중) → MATCHED(매칭완료) → PAID(결제완료) → IN_PROGRESS(진행중) → COMPLETED(처리완료) → SETTLED(정산완료)
      └─────────────┴──────────────┴── CANCELLED(취소됨)   ※ 진행중부터는 취소 불가 (취소 정책)
```

- 취소 버튼 노출 조건 = `isRequestCancellable(status)` (대기중/매칭완료/결제완료에서만 true)
- 화면 표기는 `REQUEST_STATUS_LABELS[status]` 사용 (대기중/매칭완료/…)

## 엔드포인트

### POST /requests — 요청 생성
공통 필드:

| 필드 | 타입 | 비고 |
|---|---|---|
| `kind` | `DEMOLITION \| TRANSPORT \| DISPOSAL_RESERVATION` | 철거/운반/처리장예약 |
| `requesterId` | string | 요청 주체 id |
| `region` | string | 파일럿: `"양평"` 만 접수 |
| `wasteCategory` | `"CONSTRUCTION"` | 파일럿: 건설폐기물만 |
| `wasteTons` | number | 예상 중량(톤), 양수. 5 이상이면 올바로 의무신고 안내 대상 |
| `allbaroRequested` | boolean | "올바로 전자인계서 신고 필요" 체크박스 값 |
| `sitePhotoKeys` | string[]? | 현장 사진 키 (업로드 API 로 발급받은 key, 최대 10장) |

종류별 필수 필드:
- `DEMOLITION`: `siteAddress` (현장 주소)
- `TRANSPORT`: `loadAddress` (상차지), `unloadAddress` (하차지)
- `DISPOSAL_RESERVATION`: `visitAt` (방문 일시, ISO 8601)

응답: `201` + 생성된 요청(JSON). 검증 실패: `400 { "error": "<한글 사유>" }` — 사유를 그대로 사용자에게 노출해도 되는 문구로 내려준다.

### GET /requests?requesterId=&kind=&status= — 목록 (최신순)
내 요청 목록 화면용. 쿼리 파라미터는 전부 선택.

### GET /requests/:id — 단건 조회

### PATCH /requests/:id/status — 상태 변경
```json
{ "status": "MATCHED", "matchedProviderId": "provider-7" }
{ "status": "CANCELLED", "cancelReason": "일정 변경" }
```
- 전이 규칙 위반 시 `400` (예: `'매칭완료' 상태에서 '정산완료' 로 변경할 수 없습니다.`)
- `MATCHED` 는 `matchedProviderId` 필수, `CANCELLED` 의 `cancelReason` 은 선택

### POST /requests/:id/site-photos — 현장 사진 추가 연결
```json
{ "keys": ["site-photos/demolition-request/<uuid>.jpg"] }
```
취소/정산완료 상태에는 첨부 불가. 기존 + 추가 합산 최대 10장.

## 현장 사진 업로드 (연계)

1. `POST /uploads/site-photos/presign` `{ purpose, contentType, contentLength }` → `{ key, uploadUrl, requiredHeaders }`
2. `uploadUrl` 로 파일 PUT (requiredHeaders 그대로 포함)
3. 발급받은 `key` 를 요청 생성 시 `sitePhotoKeys` 에, 또는 사진 추가 연결 API 에 전달
4. 표시할 때: `GET /uploads/site-photos/view-url?key=...` → `{ viewUrl }` (유효시간 있는 임시 URL)

## 저장 방식 (참고)

파일럿 단계는 JSON 파일 영속화(`apps/api/.data/requests.json`, gitignore) — 서버 재시작에도 유지된다.
PostgreSQL 연동 시 저장 계층만 교체 예정이며 API 계약은 그대로 유지한다.
