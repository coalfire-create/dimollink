# 학습 어댑터 서빙 → 앱 파이프라인 연결 (기획서 §3.3)

학습된 LoRA 어댑터(`recognition-ground-v1`)를 vLLM 으로 서빙하고 FastAPI 잡 서버에 연결하는 절차.
GPU 필요(L4 24GB 이상). 어댑터는 `dist/recognition-ground-v1.zip`.

## 1. vLLM 서버 기동 (GPU VM)

```bash
pip install "vllm>=0.6"
unzip recognition-ground-v1.zip -d adapters/recognition-ground-v1

python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen3-VL-8B-Instruct \
  --enable-lora \
  --lora-modules recognition-ground-v1=adapters/recognition-ground-v1 \
  --max-lora-rank 16 \
  --port 8000
```

- `--enable-lora` + `--lora-modules <이름>=<경로>` 로 어댑터를 얹는다.
- OpenAI 호환 `/v1/chat/completions` 에서 `model="recognition-ground-v1"` 로 호출하면 어댑터 적용.

## 2. FastAPI 잡 서버 연결 (.env)

```
VISION_PIPELINE=vllm
VISION_VLLM_BASE_URL=http://<vllm-host>:8000/v1
VISION_VLLM_LORA=recognition-ground-v1
VISION_MODEL_ADAPTER_HASH=ground-v1
```

파이프라인이 1패스에서 어댑터의 실제 계약(`image → {"materials":[코드]}`)으로 호출하고,
`enrich_recognition` 이 코드 목록을 리포트 스키마로 보강한다:
- 자재 코드 → materials 항목(라벨/명목 신뢰도, 물량은 2패스·현장 실측)
- **석면 의심 코드(ROOFING_SLATE 등) → hazards ASBESTOS_SUSPECT 자동 유도**(§7.1)
- 주구조 추론(site_summary.structure)

이후 RAG 검색 → 2패스(공정/폐기물) → `_enforce_safety`(석면 안내·올바로 5톤 재계산) →
worker 의 `validate_report`(최종 방어선) → 리포트 저장/콜백 → 매칭 프리필(`vision-prefill.ts`).

## 3. 검증

- 배선/보강 로직: `tests/test_vllm_integration.py` (GPU 불필요, _chat 목킹).
- 실추론 정확도: `training/infer_robust.py` (자재 P/R 0.79, 석면 재현율 100%).
- 어댑터 교체(롤백/AB): `POST /admin/reload` + `VISION_VLLM_LORA` 전환.

## 주의
- 인식 어댑터는 자재 '존재'만 식별한다(물량·개별 신뢰도 미학습). 물량은 2패스 생성·현장 실측이 채운다.
- 결제/올바로 연동은 사람이 diff 검토 후 반영(CLAUDE.md). 프리필은 값 전달만, API 미접촉.
