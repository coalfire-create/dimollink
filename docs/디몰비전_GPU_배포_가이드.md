# 디몰비전 GPU 배포 가이드 (Google Cloud, L4 + vLLM)

디몰비전 AI(자재 인식 LoRA 어댑터)를 GCP GPU에 서빙하고, 본체 디몰링크의 현장분석과 연결하는 절차.
**검증 기준**: 2026-07-10 GCP L4에서 vLLM 0.24 + `recognition-ground-v2` 서빙 성공(SERVING.md).

> ⚠️ **직접 실행 필요 부분**: 구글 로그인·프로젝트 선택·GPU VM 생성은 **과금**되며 사용자 계정 인증이 필요합니다.
> 이 세션에서는 각 명령을 `! <명령>` 으로 직접 실행하시면 결과가 대화에 들어옵니다.
> ⚠️ **비용 주의**: L4 GPU VM은 대략 시간당 $0.7~1 수준(리전·약정별 상이). **안 쓸 땐 반드시 중지/삭제**하세요.

---

## 0. 사전 준비 (Google Cloud Console)

1. **프로젝트**: console.cloud.google.com → 프로젝트 생성/선택, **결제(billing) 연결**.
2. **API 활성화**: "Compute Engine API" 사용 설정.
3. **GPU 할당량**: IAM & 관리 → 할당량 → `NVIDIA L4 GPUs`(원하는 리전, 예: `asia-northeast3`=서울 또는 `us-central1`) 최소 1 요청. (승인에 수분~수시간)
4. 로컬에 **gcloud CLI 설치**: https://cloud.google.com/sdk/docs/install (이 PC엔 미설치 상태)

```bash
# 설치 후, 이 세션에서:
! gcloud auth login
! gcloud config set project <프로젝트ID>
! gcloud config set compute/region asia-northeast3
```

---

## 1. GPU VM 생성 (L4, 딥러닝 이미지)

`! ` 로 실행:

```bash
! gcloud compute instances create dimolvision-gpu \
  --zone=asia-northeast3-a \
  --machine-type=g2-standard-8 \
  --accelerator=type=nvidia-l4,count=1 \
  --maintenance-policy=TERMINATE \
  --image-family=common-cu124-ubuntu-2204 \
  --image-project=deeplearning-platform-release \
  --boot-disk-size=100GB \
  --metadata="install-nvidia-driver=True" \
  --scopes=cloud-platform
```

- `g2-standard-8` = L4 1장 붙는 표준 머신. 드라이버는 딥러닝 이미지가 자동 설치.
- 서울 리전에 L4 할당량이 없으면 `us-central1-a` 등으로 zone 변경.

---

## 2. 어댑터 업로드 (로컬 → VM)

학습 어댑터는 로컬 `apps/vision-api/dist/recognition-ground-v2.zip` 에 있습니다.

```bash
! gcloud compute scp "apps/vision-api/dist/recognition-ground-v2.zip" \
    dimolvision-gpu:~/recognition-ground-v2.zip --zone=asia-northeast3-a
```

---

## 3. vLLM 서버 기동 (VM 접속 후)

```bash
! gcloud compute ssh dimolvision-gpu --zone=asia-northeast3-a
```

VM 안에서 (SERVING.md 검증 커맨드 — L4는 fp8 필수):

```bash
pip install "vllm>=0.6"
mkdir -p adapters && unzip ~/recognition-ground-v2.zip -d adapters/recognition-ground-v2

python3 -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen3-VL-8B-Instruct \
  --enable-lora --lora-modules recognition-ground-v2=adapters/recognition-ground-v2 \
  --max-lora-rank 16 \
  --quantization fp8 --kv-cache-dtype fp8 \
  --max-model-len 3072 --enforce-eager --gpu-memory-utilization 0.95 --port 8000
```

- 최초 기동은 Qwen3-VL-8B 모델 다운로드로 수분 소요.
- 백그라운드 상시 구동은 `nohup ... &` 또는 systemd 서비스로.

---

## 4. FastAPI 잡 서버 연결 (VM에서, apps/vision-api)

디몰비전 잡 서버(`apps/vision-api`)를 같은 VM(또는 별도)에서 띄우고 `.env`:

```
VISION_PIPELINE=vllm
VISION_VLLM_BASE_URL=http://127.0.0.1:8000/v1
VISION_VLLM_LORA=recognition-ground-v2
VISION_MODEL_ADAPTER_HASH=ground-v2
```

```bash
# vision-subsystem 브랜치 코드 기준
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

- 잡 서버가 `POST /v1/jobs`(사진 URL) → vLLM 1패스(자재) → RAG → 2패스(공정/폐기물) → 리포트 반환.

---

## 5. 방화벽 + 본체 연결

```bash
# 잡 서버 포트(8080) 외부 허용(테스트용; 운영은 IAP/프록시 권장)
! gcloud compute firewall-rules create dimolvision-8080 \
    --allow=tcp:8080 --target-tags=dimolvision --direction=INGRESS
! gcloud compute instances add-tags dimolvision-gpu --tags=dimolvision --zone=asia-northeast3-a
# VM 외부 IP 확인
! gcloud compute instances describe dimolvision-gpu --zone=asia-northeast3-a \
    --format="get(networkInterfaces[0].accessConfigs[0].natIP)"
```

본체(디몰링크) `apps/api/.env` 에 그 IP를 넣으면 mock → 실서버 자동 전환:

```
VISION_API_BASE_URL=http://<VM외부IP>:8080
VISION_API_KEY=<설정 시>
```

→ 앱 "분석" 탭이 이제 **실제 AI 분석**(mock 아님)으로 동작.

---

## 6. 비용 절감 — 다 쓰면 반드시

```bash
! gcloud compute instances stop dimolvision-gpu --zone=asia-northeast3-a   # 중지(디스크 요금만)
! gcloud compute instances delete dimolvision-gpu --zone=asia-northeast3-a # 완전 삭제
```

---

## 대안: Cloud Run GPU (서버리스, scale-to-zero)

지속 VM 대신 요청 시에만 GPU를 쓰려면 Cloud Run(L4 지원). `apps/vision-api/Dockerfile` 로:

```bash
! gcloud builds submit apps/vision-api --tag gcr.io/<프로젝트>/dimolvision
! gcloud run deploy dimolvision --image gcr.io/<프로젝트>/dimolvision \
    --gpu=1 --gpu-type=nvidia-l4 --region=asia-northeast3 --no-cpu-throttling --memory=16Gi
```
단, vLLM+8B 모델 콜드스타트(모델 로드)가 길어 첫 요청 지연이 큼 → 상시 트래픽엔 VM, 간헐 사용엔 Cloud Run.

---

## 내가 못 하는 것 / 사용자가 해야 하는 것
- 구글 로그인·결제 연결·GPU 할당량 승인 — **사용자 계정/행정**
- gcloud CLI 설치(이 PC 미설치)
- 실제 VM 생성(과금) — 위 명령을 `!` 로 실행하면 이 세션에서 함께 진행 가능
- 어댑터·vision-api 코드는 준비돼 있음(로컬 dist + vision-subsystem 브랜치)

---

# 🟢 서버리스 최저비용 구성 (상용화 권장 — scale-to-zero)

간헐적 현장 분석에는 **요청이 있을 때만 GPU 과금 → 놀 때 $0**. 분석 1건 GPU 비용 ≈ 1~2센트,
파일럿(월 수백 건)이면 **월 몇 달러~수십 달러**. 상시 VM($600+/월) 대비 압도적으로 저렴.

## 방식 A. Cloud Run GPU (GCP, scale-to-zero) — 콘솔/CLI

`apps/vision-api/Dockerfile` 로 컨테이너를 빌드해 배포. 트래픽 없으면 인스턴스 0.

```bash
# 1) 이미지 빌드·푸시 (Cloud Build)
! gcloud builds submit apps/vision-api --tag gcr.io/<프로젝트>/dimolvision

# 2) Cloud Run 배포(L4 GPU, scale-to-zero)
! gcloud run deploy dimolvision \
    --image gcr.io/<프로젝트>/dimolvision \
    --region asia-northeast3 \
    --gpu 1 --gpu-type nvidia-l4 \
    --cpu 8 --memory 32Gi \
    --min-instances 0 --max-instances 3 \
    --no-cpu-throttling --timeout 900 \
    --concurrency 4 \
    --set-env-vars VISION_PIPELINE=vllm,VISION_VLLM_LORA=recognition-ground-v2
```

- `--min-instances 0` = **놀 때 0으로 내려가 과금 없음**(핵심).
- 콜드스타트(모델 로드 수십 초~수분)는 비동기 잡+폴링으로 흡수. 초기 트래픽이 생기면 `--min-instances 1`(워밍) 검토.
- 어댑터·모델은 이미지에 포함하거나 시작 시 GCS에서 로드(빌드 크기↓).

## 방식 B. RunPod / Modal 서버리스 (per-second, 종종 GCP보다 저렴)

디몰비전 문서에도 언급된 경로. 요청당 초단위 과금 + scale-to-zero.

- **RunPod Serverless**: L4/A10 워커, 요청 없으면 0. `apps/vision-api/Dockerfile`로 서버리스 엔드포인트 생성 → 핸들러가 vLLM 1패스 호출.
- **Modal**: `@app.function(gpu="L4")` 데코레이터로 함수화, 자동 scale-to-zero. 콜드스타트 최적화(스냅샷) 지원.
- 본체 연결은 동일: 발급된 엔드포인트 URL을 `VISION_API_BASE_URL`에 설정.

## 방식 C. Spot + 오토스톱 (배치성 상시)

안정적 baseline이 생겼을 때: **Spot VM(~60~70%↓)** + **재시도 큐**(디몰비전 기본 탑재 → 선점 중단 시 자동 재시도) + 유휴 시 자동 stop 스케줄러.

## 비용 최적화 파이프라인 (공통 적용)
- **1패스(비전, GPU)만 GPU** — 2패스(공정·폐기물 텍스트 생성)는 CPU/저렴한 텍스트 모델·API로 분리.
- **CPU 사전 필터**: 흐림/어두움 사진은 GPU 전에 걸러 낭비 방지.
- **연속 배칭**(vLLM 기본) + **결과 캐싱**(동일 사진 재분석 스킵).
- **fp8/AWQ 양자화**(이미 적용) + 안정 부하 시 **CUD 약정 할인**.

## 권장 요약
```
파일럿·초기(간헐)   → Cloud Run GPU 또는 RunPod 서버리스 (min-instances 0)  ← 최저비용
성장기(상시 트래픽) → Spot 상시 + CUD + 파이프라인 분리
```
