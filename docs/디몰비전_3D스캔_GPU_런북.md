# 디몰비전 3D 스캔 — GCP GPU 런북

사진/영상 → 3D 복원(COLMAP + 3D Gaussian Splatting) → **실측 부피 → 폐기물 물량 산정**.

기존 `docs/디몰비전_GPU_배포_가이드.md`(vLLM 서빙)와 **별개 워크로드**다.
서빙은 상주형이라 Cloud Run 이 맞고, 3D 복원은 배치라 **Spot VM** 이 맞다.

> ⚠️ **과금**: 아래 VM 생성은 즉시 과금된다. **다 쓰면 반드시 stop 또는 delete.**
> 이 세션에서는 각 명령을 `! <명령>` 으로 실행하면 결과가 대화에 들어온다.

---

## 비용 요약

| 항목 | 근거 | 비용 |
|---|---|---|
| 현장 1건 복원 | 0.75시간 × Spot L4 ≈ $0.45/hr | **약 $0.34 (450원)** |
| 파이프라인 개발·디버깅 | GPU 실사용 10~15시간 | 약 $6 |
| 테스트 현장 10~20건 | 8~15시간 | 약 $5 |
| Cloud Storage + egress | 수 GB | 약 $2 |
| **개발 + 데모 전체** | | **$13~20** |

$300 크레딧의 7% 미만. 단가는 리전·시점에 따라 다르니
[가격 계산기](https://cloud.google.com/products/calculator)로 확인할 것.

**비용을 줄이는 규칙 3개**
1. **Spot 을 쓴다** — 온디맨드의 30~40%. 배치라 선점당해도 재시도하면 그만이고,
   재시도 큐가 이미 있다(`app/worker.py`).
2. **끝나면 자동으로 끈다** — 아래 `--max-run-duration` 이 그 역할을 한다.
3. **GPU 없이 되는 건 로컬에서 끝낸다** — 프레임 선별·품질 판정·부피 환산은
   전부 순수 함수로 분리해 `pytest tests/test_scan3d.py` 로 검증했다.
   뷰어도 헤드리스 크롬 + 합성 3DGS 장면으로 끝까지 확인했다(과금 0원).

**촬영 길이별 흐림 선별 효과 (실측, 3장 중 1장만 선명한 영상 기준)**

| 촬영 시간 | 추출(8fps) | 구간당 후보 | 선별 후 선명 비율 |
|---|---|---|---|
| 20초 | 160장 | 1.1 | 36% (무작위 33% — 사실상 무효) |
| 30초 | 240장 | 1.6 | 53% |
| **45초** | 360장 | 2.4 | **80%** ← 권장 하한 |
| 60초 | 480장 | 3.2 | 100% |

권장 촬영 시간을 45~60초로 잡은 근거가 이 표다.

---

## 0. 사전 확인 (콘솔)

CLI 를 설치하지 않아도 된다. 콘솔 우상단 **Cloud Shell**(`>_` 아이콘)을 열면
브라우저 안에서 gcloud 가 바로 쓸 수 있다(무료).

1. **결제 연결** — 결제 → 크레딧 $300 확인.
2. **API 사용 설정** — Compute Engine API.
3. **GPU 할당량** — IAM 및 관리자 → 할당량 → `NVIDIA L4 GPUs` 검색.
   - 새 프로젝트는 **0으로 시작한다.** 리전(`asia-northeast3` 또는 `us-central1`)에
     최소 1 을 요청한다. 승인에 수분~하루.
   - **Preemptible NVIDIA L4 GPUs** 할당량도 함께 요청한다(Spot 을 쓰려면 별도다).

```bash
! gcloud config set project <프로젝트ID>
! gcloud compute regions describe asia-northeast3 --format="value(quotas)" | tr ';' '\n' | grep -i l4
```

---

## 1. Spot GPU VM 생성

```bash
! gcloud compute instances create dimol-scan3d \
  --zone=asia-northeast3-a \
  --machine-type=g2-standard-16 \
  --accelerator=type=nvidia-l4,count=1 \
  --provisioning-model=SPOT \
  --instance-termination-action=DELETE \
  --max-run-duration=6h \
  --maintenance-policy=TERMINATE \
  --image-family=common-cu124-ubuntu-2204 \
  --image-project=deeplearning-platform-release \
  --boot-disk-size=200GB \
  --boot-disk-type=pd-balanced \
  --metadata="install-nvidia-driver=True" \
  --scopes=cloud-platform
```

서빙 가이드와 다른 점과 그 이유:

| 옵션 | 값 | 왜 |
|---|---|---|
| `--machine-type` | `g2-standard-16` | **COLMAP 특징점 추출이 CPU 를 많이 쓴다.** 서빙용 8vCPU 로는 매칭 단계가 병목 |
| `--provisioning-model` | `SPOT` | 배치 워크로드 — 60~70% 저렴 |
| `--max-run-duration` | `6h` | **끄는 걸 잊어도 자동 종료.** 크레딧을 지키는 가장 확실한 장치 |
| `--instance-termination-action` | `DELETE` | 종료 시 디스크까지 정리(정지 상태 디스크 요금도 안 나감) |
| `--boot-disk-size` | `200GB` | 프레임 + COLMAP 중간 산출물이 현장당 수 GB |

서울에 L4 Spot 재고가 없으면 `us-central1-a`, `asia-northeast1-a` 로 바꿔 시도한다.

---

## 2. 의존성 설치 (VM 안)

```bash
! gcloud compute ssh dimol-scan3d --zone=asia-northeast3-a
```

```bash
# COLMAP + ffmpeg
sudo apt-get update && sudo apt-get install -y colmap ffmpeg

# 3DGS(gsplat) + 메시/부피 측정
pip install gsplat trimesh open3d numpy

# 확인 — 여기서 GPU 가 안 잡히면 진행하지 말 것
nvidia-smi
colmap -h | head -3
python -c "import gsplat, trimesh; print('ok')"
```

---

## 3. 복원 실행

코드는 `apps/vision-api/app/scan3d/` 에 있다. VM 으로 올린다:

```bash
! gcloud compute scp --recurse apps/vision-api dimol-scan3d:~/vision-api \
    --zone=asia-northeast3-a
```

VM 안에서:

```bash
cd ~/vision-api

# ① 영상 → 프레임 (8fps 로 넉넉히 뽑고, 구간별 최선명 150장을 고른다)
#    ⚠️ 목표(150장)와 같은 수만 뽑으면 구간당 후보가 1장뿐이라 흐림 선별이 무력해진다.
mkdir -p /tmp/scan/images
ffmpeg -i site.mp4 -vf fps=8 -q:v 2 /tmp/scan/images/frame_%05d.jpg

# ② COLMAP + 3DGS + 부피 (파이프라인이 단계별로 수행)
python -c "
from app.scan3d import run_reconstruction
r = run_reconstruction(
    image_dir='/tmp/scan/images',
    work_dir='/tmp/scan/work',
    out_dir='/tmp/scan/out',
    scale_factor=1.0,          # AR 포즈가 있으면 1.0(이미 미터), 없으면 대장 역산값
    scale_source='AR_POSE',
    raw_volume_units=0.0,      # 메시에서 잰 부피를 넣는다
    input_image_count=len(__import__('os').listdir('/tmp/scan/images')),
    on_stage=print,
)
print(r.as_dict())
"
```

**첫 실행은 반드시 `--max-steps 7000`(빠른 모드)으로 확인한다.** 배선이 맞는지 6~8분에
알 수 있고, 30k 로 25분 태운 뒤 실패하는 것보다 훨씬 싸다.

---

## 4. 결과 회수 + VM 종료

```bash
! gcloud compute scp dimol-scan3d:/tmp/scan/out/point_cloud.ply ./scan-result.ply \
    --zone=asia-northeast3-a

# ⚠️ 가장 중요한 명령
! gcloud compute instances delete dimol-scan3d --zone=asia-northeast3-a --quiet
```

`--max-run-duration=6h` 가 있어도 **끝나면 바로 지우는 습관**을 들일 것.
6시간 방치 = 약 $2.7 낭비다.

---

## 5. 예산 알림 (권장 — 5분)

크레딧을 다 태우는 사고를 막는 유일한 안전장치다.

콘솔 → **결제 → 예산 및 알림 → 예산 만들기**
- 금액: `$50`
- 알림: 50% / 90% / 100%
- 이메일 수신 체크

---

## 실패했을 때 — 원인별 대처

| 증상 | 원인 | 대처 |
|---|---|---|
| `registeredRatio` 가 0.7 미만 | 겹침 부족(빨리 돌았다) / 흔들림 | 더 천천히, **45~60초**로 다시 촬영 |
| `pointCount` 가 2만 미만 | 무늬 없는 벽·판넬(특징점 없음) | 주변 지형·모서리를 더 담기. 실내면 가구·자재를 화면에 넣기 |
| 한 바퀴가 안 닫힘 | 루프 클로저 실패 | 출발점으로 확실히 돌아와 2~3초 더 촬영 |
| 유리·금속 부분이 깨짐 | 반사(각도마다 색이 변함) | 불가피 — 해당 면은 부피에서 제외하고 대장으로 보완 |
| Spot 이 중간에 죽음 | 선점 | 재시도 큐가 자동 처리. 잦으면 다른 zone 으로 |
| VM 생성이 quota 오류 | 할당량 0 | 0번 단계의 할당량 요청 |

---

## 왜 3D 인가 — 물량 산정과의 연결

3D 의 값어치는 보기 좋은 게 아니라 **재는 것**이다.

기존: `연면적 × 원단위(1.58 t/㎡)` — 대장에 의존하고 **층고와 증축부를 못 본다.**

3D 이후: `실측 외피 부피(㎥) × 부피 원단위(t/㎥)` — [[scan-volume]]

부피 원단위는 면적 원단위를 기준 층고 3m 로 나눠 유도했다. 그래서 **층고 3m 표준 건물에서는
두 방법이 같은 답**을 내고, 층고가 다르거나 증축부가 있을 때만 갈라진다. 새 상수를 지어내지
않고 기존 검증값과 정합을 유지하기 위한 설계다(`scan-estimator.test.ts` 가 이 등식을 검증한다).

**나쁜 스캔은 쓰지 않는다.** 정렬률·점군·스케일 근거 게이트를 통과하지 못하면 연면적
원단위로 폴백하고, 왜 폴백했는지 고지에 남긴다. "실측"이라는 이름값에 속으면
통계 추정보다 나쁜 숫자를 신뢰하게 된다.

---

## 스케일(실제 치수)을 어디서 얻는가

복원은 기본적으로 **크기를 모른다** — 비율만 안다. 배율이 틀리면 부피는 세제곱으로
틀리므로, 스케일 근거가 곧 물량 정확도다. 가진 것 중 가장 정확한 것을 자동으로 고른다
(`resolveScale` — TS·Python 양쪽 동일 순서).

| 출처 | 오차폭 | 필요 조건 |
|---|---|---|
| `AR_POSE` | ±10% | ARKit/ARCore — **네이티브 모듈 필요(미구현)** |
| `REFERENCE_OBJECT` | ±15% | A4·줄자를 함께 촬영 |
| **`WALKING_DISTANCE`** | **±18%** | **만보계 걸음수 × 보폭 ÷ 복원 카메라 경로 길이** |
| `LEDGER_AREA` | ±25% | 건축물대장 연면적(대장이 맞다는 전제) |
| `NONE` | — | 부피를 쓸 수 없다 |

보행 거리가 실질적인 주력이다. 추가 의존성 없이(`expo-sensors` 만으로) **실제 물리
기준**을 얻고, 대장이 없거나 틀린 현장에서도 동작하며, 대장 역산보다 오차폭이 좁다.
복원 카메라 경로 길이는 COLMAP 포즈에서 계산한다(`camera_path_length`).

## ⚠️ 스토리지 CORS — 안 하면 뷰어가 조용히 멈춘다

3DGS 장면(.ply)은 뷰어 페이지와 **다른 오리진**(S3/presigned URL)에서 온다. 버킷에
CORS 가 없으면 브라우저가 fetch 를 막고, **오류도 없이 "장면을 불러오는 중"에서 멈춘다.**
(헤드리스 브라우저 검증에서 실제로 이 증상으로 막혔다.)

S3/R2 버킷에 아래를 넣는다:

```json
[{
  "AllowedOrigins": ["https://<앱-도메인>"],
  "AllowedMethods": ["GET"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3000
}]
```

검증: `curl -sI -H "Origin: https://<앱-도메인>" "<presigned-url>" | grep -i access-control`

## 뷰어 구현에서 걸렸던 것 (검증 완료)

헤드리스 크롬으로 실제 3DGS 장면을 띄워 확인한 항목이다. 셋 다 **오류 없이 멈추는**
증상이라 코드만 봐서는 못 잡는다.

| 문제 | 증상 | 해결 |
|---|---|---|
| UMD(.cjs) 로드 | 스크립트가 실행되지 않음 | jsDelivr 가 `.cjs` 를 `application/node`+`nosniff` 로 서빙 → **ESM(`.module.js`) + importmap** 사용 |
| three.js 피어 누락 | 라이브러리 초기화 실패 | importmap 으로 `three` 매핑 |
| WebGL 지원 검사 | 장면 로드가 멈춤 | 렌더 캔버스에서 `getContext` 를 부르면 컨텍스트를 점유 → **버리는 캔버스**로 검사 |

## 남은 작업

- [ ] GPU 할당량 승인 → VM 1회 기동 → 실제 현장 영상 1건으로 E2E 검증
- [ ] 메시 부피 측정(trimesh watertight 판정) 실제 구현 — 현재는 계약·게이트만 완성
- [x] 스케일 근거 다중화 — 보행 거리(만보계) 추가. 대장 역산보다 오차폭이 좁다
- [ ] ARKit/ARCore VIO 포즈 — **네이티브 모듈 + dev build 필요**(Expo 52 + expo-sensors
      만으로는 위치를 못 얻는다). 붙이면 오차폭이 ±18% → ±10% 로 줄지만, 현재도
      보행 거리로 실제 물리 기준을 확보하므로 급하지 않다
- [x] 스캔 촬영 화면(모바일) `Scan3DCaptureModal` · WebView 3DGS 뷰어 `/scan-viewer` — 헤드리스 크롬 검증 완료
- [ ] 복원 잡을 기존 `SiteAnalysisQueue` 패턴에 연결
