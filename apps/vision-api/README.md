# apps/vision-api — 디몰비전 AI 서버

철거 현장 사진 → 자재 인식 + 안전지침 인용 공정표 + 폐기물 계획을 산출하는 **자체 VLM** 추론 서버.
기획서 `docs/디몰비전_AI_시스템_기획서.docx` §3(아키텍처)·§5(API/DB) 기준. 커밋 접두어 `[V-Phase N]`.

> ⚠️ 이 디렉터리는 **Phase V1 MVP 골격**이다. 실제 추론(vLLM + Qwen3-VL LoRA)은 GPU·파인튜닝
> 어댑터가 있어야 하며 `VISION_PIPELINE=vllm` 경로는 아직 미구현(`app/pipeline/vllm.py`).
> 로컬/CI 는 스키마 유효 리포트를 내는 **mock 파이프라인**으로 전체 배관(잡 큐·콜백·검증)을 검증한다.

## 구조

```
app/
  config.py        환경 설정(Settings, VISION_ 접두어) — 모든 키는 .env
  auth.py          API 키 인증(Edge Function 전용 / 관리자)
  taxonomy.py      자재 12종 + 고정 문구 (packages/shared 미러, 단일 원천은 TS)
  schemas.py       요청/응답 + 분석 리포트 스키마(VisionReport wire 계약)
  validation.py    출력 검증 레이어(§7.1 — 석면 확정표현 금지 등)
  store.py         잡 저장소(SQLite, durable)
  worker.py        비동기 워커(동시성 1, 재시도 ≤ max_retries)
  callback.py      Supabase 콜백(best-effort, 폴링 폴백)
  pipeline/        추론 파이프라인 (base/mock/vllm) + 팩토리
  routes.py        /v1/jobs*, /v1/health, /admin/reload
  main.py          FastAPI 조립(lifespan: 저장소·워커 기동)
tests/             pytest (mock 경로 E2E + 검증 단위)
```

## 엔드포인트 (§5.1)

| 메서드 | 경로 | 인증 | 역할 |
|---|---|---|---|
| POST | `/v1/jobs` | Edge(API 키) | 분석 잡 생성(사진 서명 URL·부가정보·콜백 URL) |
| GET | `/v1/jobs/{id}` | Edge(API 키) | 잡 상태·결과 조회(콜백 실패 대비 폴링) |
| POST | `/v1/jobs/{id}/cancel` | Edge(API 키) | 잡 취소 |
| GET | `/v1/health` | 공개 | 모델 버전·큐 길이·파이프라인 헬스체크 |
| POST | `/admin/reload` | 관리자 키 | LoRA 어댑터 교체(모델 버전 롤아웃/롤백) |

모든 `result` 에 `model_version`(base + adapter 해시)을 포함해 품질 추적·A/B 를 가능하게 한다.

## 로컬 실행

```bash
cd apps/vision-api
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env          # 키 값 조정
uvicorn app.main:app --reload

# 헬스체크
curl localhost:8000/v1/health

# 잡 생성(위 .env 의 VISION_API_KEY)
curl -X POST localhost:8000/v1/jobs -H "X-API-Key: dev-edge-key" \
  -H "Content-Type: application/json" \
  -d '{"photo_urls":["https://example.com/a.jpg"]}'
```

## 테스트

```bash
pip install -e ".[dev]"
pytest
```

## 다음 (미구현)

- `pipeline/vllm.py` 2-패스(인식→지침검색→생성) 실제 구현 — Phase V1(프롬프트)·V3(파인튜닝)
- Supabase Edge Function ↔ 이 서버 연동, Storage 서명 URL 발급 흐름
- RAG 안전지침 KB(pgvector, BGE-M3 임베딩) 검색 연결 — §3.4
- GPU 서빙(RunPod serverless, FP8/AWQ 양자화, prefix caching) — §6.1
