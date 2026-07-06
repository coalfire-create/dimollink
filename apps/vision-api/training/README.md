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

### 공개 데이터 콜드스타트(승인 없이 즉시 가능)

12종 중 **10종**은 공개 데이터로 시작할 수 있다. 매핑은 `training/public_datasets.py`.

| 데이터셋 | 라이선스/접근 | 커버 | 링크 |
|---|---|---|---|
| **CODD** | CC BY 4.0, 즉시 다운로드(3,129장) | 9/12 | data.mendeley.com/datasets/wds85kt64j |
| **AI Hub 산업폐기물** | 무료, 활용승인 필요 | +GLASS 등 | aihub.or.kr (산업 폐기물 이미지) |
| **CDW-Seg / Roboflow** | 공개 | 보강 | Nature Sci Data / Roboflow Universe |

**석면 슬레이트(ROOFING_SLATE)와 철근콘크리트 구분은 공개 라벨이 없다** — 자체 수집 필수(핵심 자산).
석면은 안전-치명 지표(재현율 0.95)라 양평 근접 촬영으로만 확보. `SELF_COLLECT_REQUIRED` 참고.

### 실행 순서

```bash
# 1) 공개데이터(COCO) → 우리 12종 학습 JSONL
python scripts/prepare_data.py --format coco --dataset codd \
    --coco data/CODD/annotations.json --images data/CODD/images \
    --out data/train_recognition.jsonl
# 2) 배선 검증(GPU 불필요)
python training/train.py --config training/qlora_config.yaml --task recognition --dry-run
# 3) 실학습은 Colab Pro+(A100): training/colab_qlora.ipynb
# 4) 평가 게이트(§V3)
python scripts/eval.py --evalset eval_samples/sample_evalset.jsonl
```

## 종료 기준 (§V3)

주요 5종 재현율 ≥ 0.85, 석면 의심 재현율 ≥ 0.95. 미달 시 데이터 보강 반복.
합격한 어댑터만 `model_versions` 대장에 평가 결과와 함께 기록 후 배포(`POST /admin/reload`).

## 서빙 비용 (§6.1, 미실행)

FP8/AWQ 양자화로 24GB GPU 서빙, RunPod serverless scale-to-zero, vLLM prefix caching.
