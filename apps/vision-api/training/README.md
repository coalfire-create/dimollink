# training — 디몰비전 파인튜닝 (기획서 §4.2, §6.2)

> ⚠️ **GPU 필요·미실행.** 이 폴더는 파인튜닝 레시피(하이퍼파라미터·데이터 경로·종료 기준)를 고정한다.
> 실제 학습은 스팟 GPU 인스턴스에서 수행하며, 외부 API 무종속(오픈 웨이트 + 로컬 학습) 원칙을 지킨다.

## 단계 (§4.2 단계적 고도화)

1. **L0 (프롬프트)** — 파인튜닝 전, 프롬프트+RAG 로 베이스 모델 성능 측정(`VISION_PIPELINE=vllm`).
2. **L1 (1패스 QLoRA)** — 자재 인식을 QLoRA 로 먼저 학습. `qlora_config.yaml` 의 `tasks.recognition`.
3. **L2 (2패스)** — 공정표 생성은 루브릭 채점 후 필요 시 학습(`tasks.generation.enabled`).

## 데이터

- 학습셋: AI Hub 산업 폐기물 데이터셋(콜드 스타트) + 양평 자체 수집(핵심 자산) 라벨.
- 플라이휠: `app/feedback/export.py` 가 피드백을 과업별 학습 예시(JSONL)로 축적(§V5).
- 평가셋: 학습셋과 분리(§4.4). `scripts/eval.py` 가 종료 기준을 자동 판정.

## 종료 기준 (§V3)

주요 5종 재현율 ≥ 0.85, 석면 의심 재현율 ≥ 0.95. 미달 시 데이터 보강 반복.
합격한 어댑터만 `model_versions` 대장에 평가 결과와 함께 기록 후 배포(`POST /admin/reload`).

## 서빙 비용 (§6.1, 미실행)

FP8/AWQ 양자화로 24GB GPU 서빙, RunPod serverless scale-to-zero, vLLM prefix caching.
