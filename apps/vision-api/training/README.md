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

### 전국 국가데이터 수집(양평 한정 탈피, 수작업 촬영 최소화)

석면 슬레이트는 이미지 공개 라벨이 없지만, **한국 국가데이터로 전국에서 약라벨을 뽑을 수 있다**
(`training/korea_sources.py`, `scripts/harvest_korea.py`):

- **건축물대장 표제부**(건축HUB OpenAPI, data.go.kr 15134735) — `주구조코드명`·`지붕코드명`으로
  전국 건물의 자재를 약라벨. **`지붕코드명=슬레이트` → ROOFING_SLATE**(석면 의심 최초 확보 경로).
- **VWorld 항공정사영상**(국토지리정보원 OpenAPI) — 좌표별 지붕 top-down 영상 취득.
- **환경부 석면관리종합정보망(슬레이트 실태조사)** — 검증된 슬레이트 정답(면적·준공연도)으로 크로스체크.

```bash
# 배선 검증(키 불필요, 전국 다지역 mock)
python scripts/harvest_korea.py --mock --regions all --images data/korea/img --out data/train_korea.jsonl
# 실수집(.env 에 VISION_BLDG_LEDGER_KEY, VISION_VWORLD_KEY): 석면만 우선
python scripts/harvest_korea.py --regions 41830,47130,26110 --asbestos-only \
    --images data/korea/img --out data/train_korea.jsonl
```

⚠️ 항공영상은 지붕 top-down 이라 지상 촬영과 도메인 갭이 있다. 석면 지붕 인식엔 정합적이나,
지상 근접 자재는 앱 플라이휠(§V5)·소량 자체촬영으로 보완. 약라벨은 실태조사로 검증 후 승격.
⚠️ 서비스 파일럿은 양평 유지(비즈니스 규칙). **학습 데이터만** 전국 대상(일반화 목적).

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

## 실학습 결과 (2026-07-07, GCP L4 실행·검증됨)

전국 국가데이터 4,000장(슬레이트 2,001/비석면 1,999, train 3,400/eval 600)으로 실제 QLoRA 학습 완료.

- **환경**: GCP `g2-standard-8`(NVIDIA L4 23GB), Deep Learning 이미지(PyTorch 2.9/CUDA 12.9), asia-northeast3.
- **모델**: `Qwen/Qwen3-VL-8B-Instruct` 4bit + LoRA(r16, 15.3M 학습, 0.17%). 1 epoch/850스텝/~3.05h.
- **loss**: 11.98 → 3.08(step200) → 3.32(최종 평균). 포맷·과업 학습 확인.
- **eval 40장 추론 검증**: JSON 포맷 40/40, **석면 슬레이트 재현율 14/14 = 1.00(목표 0.95 초과)**,
  자재 전체 precision 0.47/recall 0.61(약라벨 콜드스타트 한계 — 실태조사 검증라벨·지상사진·추가 epoch으로 개선).
- 실행 스크립트: `training/train_gpu.py`(4bit+LoRA+kbit준비+그래디언트 체크포인트), `training/infer_test.py`(추론 검증).

## 정확도 개선: 지상 자재 데이터(MINC) 결합 (2026-07-07, 검증됨)

항공 모델의 약점 진단: **항공(top-down)은 지붕만 보여** 지붕재(석면 슬레이트)는 100% 잡지만
구조재(콘크리트·벽돌·목재·금속)는 안 보여 P/R이 낮았다(0.47/0.61). 앱은 **지상 근접 사진**이 입력이라
도메인도 불일치. → **지상 자재 데이터셋 MINC-2500** 결합으로 해결.

- `training/minc_prep.py`: MINC-2500(지상 자재 패치, 무인증 다운로드) → 8개 카테고리를 우리 taxonomy로
  (brick·stone→BRICK_MASONRY, wood→WOOD, metal→METAL, glass→GLASS, tile·ceramic→SANITARY_TILE, plastic→WASTE_SYNTHETIC_RESIN).
- 학습셋: MINC 지상자재 2,400 + Korea 슬레이트 800 = 3,200(석면 능력 유지). 1 epoch/GCP L4/~4.25h.
- **eval(60장) 결과: 자재 precision 0.79 / recall 0.79** (항공 0.47/0.61 대비 대폭 향상). JSON 100%.
  클래스별: 벽돌 8/8·수지 8/8·목재 6/7·금속 7/9·타일 9/11·유리 5/7.
- `training/infer_robust.py`: 생성 타임아웃 + `use_cache=True` 강제(추론 hang 방지) 검증 스크립트.
- 어댑터 `dist/recognition-ground-v1.zip`.

### v2 — 콘크리트 클래스 추가 + MINC 확장 (2026-07-10, 검증됨)

빠진 콘크리트 클래스를 채우고 MINC 를 확장해 재학습. 콘크리트는 HF `mohammadnajeeb/concrete_crack_images`
(24k 지상 콘크리트 표면) → REINFORCED_CONCRETE.

- 학습셋 5,600(MINC 4,000[500/클래스] + 콘크리트 600 + 슬레이트 1,000), 8개 자재 클래스.
  loss step100 평탄화 → **checkpoint-800 조기 종료**(v1과 동일 3,200 노출, 시간 절약).
- **eval(96장): 자재 P/R 0.83/0.85 (v1 0.79/0.79 대비 향상), JSON 100%.**
  클래스별: 벽돌 14/14·**콘크리트 13/13(신규)**·슬레이트 2/2·금속 5/6·타일 14/18·목재 7/9·수지 7/9·유리 6/8.
- 어댑터 `dist/recognition-ground-v2.zip`. 다음: 석고보드/단열재 라벨, 다중자재 씬 데이터.

### 다중 자재 씬 — 시도·보류 (2026-07-11)

앱의 최대 약점은 **단일 자재 패치로 학습 ↔ 실제는 다중 자재 씬** 도메인 갭. 공개 다중객체 C&D
데이터(CODD 등)는 무인증 다운로드 불가라, `training/scene_gen.py`로 단일 패치를 합성해 다중 자재
씬을 만들어 재학습을 시도함(train 4,900, 다중자재 59%).

- ⚠️ **보류**: 512px 합성 씬이 L4 에서 GPU 21%·31s/step(10h/epoch)로 비효율 + 그리드 합성이라
  실제 씬과 갭. ROI 부족으로 중단.
- 재개 시: (a) 씬 이미지 256~320px 로 축소 + `min/max_pixels` 캡, (b) A100 사용, 또는
  (c) **Roboflow Universe** 실제 C&D 다중객체 데이터(무료 API 키 필요)로 교체 — 이게 정도(正道).

### GCP L4 환경 셋업 주의(실측)
1. `Qwen/Qwen3-VL-8B`는 없음 → **`Qwen/Qwen3-VL-8B-Instruct`** 사용.
2. DLVM 사전설치 `torchaudio`가 torch와 불일치 → transformers 임포트 깨짐. **torchaudio 제거**.
3. `jinja2>=3.1.0` 필요(채팅 템플릿). 4. Trainer에 `remove_unused_columns=False`(image/answer 컬럼 유지).
5. GPU 쿼터: 신규/체험 계정은 GPUS_ALL_REGIONS=0 → **유료 전환 후** 전역+리전(L4) 쿼터 증설.

## 서빙 비용 (§6.1, 미실행)

FP8/AWQ 양자화로 24GB GPU 서빙, RunPod serverless scale-to-zero, vLLM prefix caching.
