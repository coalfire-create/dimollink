# 디몰링크 (DimolLink)

철거 업체 · 운반 업체 · 폐기물 처리장을 연결하는 매칭 플랫폼.
핵심 차별점은 환경부 올바로시스템(Allbaro) API 연동.

프로젝트 규칙·비즈니스 규칙·민감정보 취급은 [`CLAUDE.md`](./CLAUDE.md)를,
로드맵은 [`docs/디몰링크_개발_로드맵.docx`](./docs)를 먼저 확인할 것.

## 구조 (npm workspaces 모노레포)

```
apps/
  mobile/   # React Native (TypeScript) 앱
  api/      # Node.js + Express (TypeScript) 백엔드
packages/
  shared/   # 공통 타입·상수 (수수료율, 올바로 의무신고 기준 등)
docs/       # 로드맵, 기획서
```

## 요구 사항

- Node.js >= 20 (`.nvmrc` 참고)
- npm >= 9 (workspaces)
- PostgreSQL (api 실행 시)

## 시작하기

```bash
# 1) 의존성 설치 (루트에서 한 번)
npm install

# 2) 공통 패키지 빌드 (api/mobile 가 참조)
npm run build:shared

# 3) 백엔드 개발 서버
cp apps/api/.env.example apps/api/.env   # 값 채우기 (절대 커밋 금지)
npm run api:dev                          # http://localhost:4000/api/health

# 4) 모바일 메트로 서버
npm run mobile:start
```

## 자주 쓰는 스크립트 (루트)

| 명령 | 설명 |
| --- | --- |
| `npm run lint` | 전체 ESLint |
| `npm run format` | Prettier 포맷 |
| `npm run typecheck` | 워크스페이스 전체 타입 체크 |
| `npm test` | 워크스페이스 전체 테스트 (정산/수수료 유닛 테스트 포함) |
| `npm run build` | shared → 전체 빌드 |

## 반드시 지킬 것

- 올바로/PG/DB 시크릿은 `.env` 에만. 코드·커밋·프롬프트에 값 노출 금지.
- 결제/정산·올바로 연동·세금계산서 코드는 사람이 직접 diff 검토 후 반영.
- 수수료율 등 비즈니스 상수는 `packages/shared` 에서만 변경.
