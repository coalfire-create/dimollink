"""COLMAP + 3D Gaussian Splatting 복원 파이프라인.

단계(‌`site-scan-3d.ts` 의 Scan3DStage 와 1:1):
  EXTRACTING      영상 → 프레임(구간별 최선명 선별)
  MATCHING        COLMAP 특징점 추출·매칭        ← GPU, 가장 오래 걸림
  RECONSTRUCTING  COLMAP 카메라 위치·희소 점군    ← GPU
  SPLATTING       3DGS 학습(실사 화질 장면)       ← GPU
  MEASURING       외피 부피 측정

외부 바이너리(ffmpeg/colmap)와 학습 스크립트는 **명령 문자열로 분리**해 두었다.
GPU 없이도 명령 구성·단계 전이·결과 파싱을 검증할 수 있게 하기 위해서다
(GPU 를 켜는 시간이 곧 비용이므로, 배선 오류는 로컬에서 다 잡고 올라간다).
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional

from .frames import ffmpeg_extract_command
from .quality import ScanQuality, assess_scan_usability, registered_ratio, scaled_volume_m3
from .volume import DEFAULT_VOXEL_SIZE, VolumeMeasurement, measure_ply

StageCallback = Callable[[str], None]

# 3DGS 학습 반복 수. 7k 면 형태가 잡히고 30k 면 실사 화질에 가깝다.
# L4 기준 7k ≈ 6~8분, 30k ≈ 20~25분 — 비용과 화질의 교환점이다.
SPLAT_ITERATIONS_FAST = 7_000
SPLAT_ITERATIONS_QUALITY = 30_000


@dataclass
class ReconstructionResult:
    """복원 산출물 + 품질 근거. 그대로 JSON 으로 본체에 넘어간다."""

    gross_volume_m3: float
    #: 복원 좌표계 원시 부피(단위³). 배율만 바꿔 재계산할 수 있게 남긴다.
    raw_volume_units: float
    scale_source: str
    quality: ScanQuality
    usable: bool
    reasons: List[str] = field(default_factory=list)
    splat_path: Optional[str] = None
    mesh_path: Optional[str] = None
    frame_count: int = 0
    #: 부피 측정 상세(격자 커버리지·경계상자 등). 측정에 실패하면 None.
    measurement: Optional[VolumeMeasurement] = None

    def as_dict(self) -> Dict:
        return {
            "grossVolumeM3": round(self.gross_volume_m3, 3),
            # 배율 재계산용 — 이 값이 있으면 기준 물체를 다시 재도 GPU 재실행이 필요 없다.
            "rawVolumeUnits": round(self.raw_volume_units, 4),
            "scaleSource": self.scale_source,
            "quality": self.quality.as_dict(),
            "usable": self.usable,
            "reasons": self.reasons,
            "splatPath": self.splat_path,
            "meshPath": self.mesh_path,
            "frameCount": self.frame_count,
            "measurement": self.measurement.as_dict() if self.measurement else None,
        }


def colmap_commands(image_dir: str, work_dir: str, use_gpu: bool = True) -> List[List[str]]:
    """COLMAP SfM 명령 3단계. 실행은 호출부가 한다(테스트 가능하게 분리)."""
    db = os.path.join(work_dir, "database.db")
    sparse = os.path.join(work_dir, "sparse")
    gpu = "1" if use_gpu else "0"
    return [
        # ① 특징점 추출. 철거 현장은 무늬 없는 벽이 많아 기본값보다 많이 뽑는다.
        ["colmap", "feature_extractor",
         "--database_path", db, "--image_path", image_dir,
         "--ImageReader.single_camera", "1",
         "--SiftExtraction.use_gpu", gpu,
         "--SiftExtraction.max_num_features", "16384"],
        # ② 매칭. 한 바퀴 도는 촬영은 순차 매칭 + 루프 감지가 exhaustive 보다 훨씬 빠르다.
        ["colmap", "sequential_matcher",
         "--database_path", db,
         "--SiftMatching.use_gpu", gpu,
         "--SequentialMatching.loop_detection", "1"],
        # ③ 카메라 위치·희소 점군 복원.
        ["colmap", "mapper",
         "--database_path", db, "--image_path", image_dir, "--output_path", sparse],
    ]


def splat_command(
    work_dir: str, out_dir: str, iterations: int = SPLAT_ITERATIONS_QUALITY
) -> List[str]:
    """3DGS 학습 명령(gsplat 계열 트레이너 기준)."""
    return [
        "python", "-m", "gsplat.trainer",
        "--data-dir", work_dir,
        "--result-dir", out_dir,
        "--max-steps", str(iterations),
    ]


def camera_path_length(sparse_dir: str) -> float:
    """복원된 카메라 경로 길이(복원 좌표계 단위).

    보행 거리(걸음수 × 보폭)와 이 길이를 나누면 길이 배율이 나온다 — 대장이 없거나
    틀린 현장에서도 실제 물리 기준으로 스케일을 잡을 수 있다.

    COLMAP images.txt 의 각 줄은 `IMAGE_ID QW QX QY QZ TX TY TZ CAMERA_ID NAME`.
    카메라 중심은 C = -R^T · t 인데, 여기서는 **경로 길이의 비**만 쓰므로
    회전 없이 t 만으로도 스케일 비는 보존되지 않는다 — 그래서 R 을 제대로 적용한다.
    """
    images_txt = os.path.join(sparse_dir, "images.txt")
    if not os.path.exists(images_txt):
        return 0.0

    centers: List[tuple] = []
    lines = [ln for ln in _read_lines(images_txt) if ln.strip() and not ln.startswith("#")]
    # 이미지 1장이 2줄(포즈 + 관측점)이라 짝수 줄만 포즈다.
    for line in lines[::2]:
        parts = line.split()
        if len(parts) < 8:
            continue
        try:
            qw, qx, qy, qz = (float(v) for v in parts[1:5])
            tx, ty, tz = (float(v) for v in parts[5:8])
        except ValueError:
            continue
        centers.append(_camera_center(qw, qx, qy, qz, tx, ty, tz))

    total = 0.0
    for a, b in zip(centers, centers[1:]):
        total += sum((a[i] - b[i]) ** 2 for i in range(3)) ** 0.5
    return total


def _camera_center(qw: float, qx: float, qy: float, qz: float,
                   tx: float, ty: float, tz: float) -> tuple:
    """쿼터니언 + 평행이동 → 카메라 중심 C = -R^T · t."""
    # R (world→camera) 를 쿼터니언에서 만든다.
    r = (
        (1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)),
        (2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)),
        (2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)),
    )
    t = (tx, ty, tz)
    # R^T · t (전치라 열 방향으로 곱한다)
    return tuple(-sum(r[k][i] * t[k] for k in range(3)) for i in range(3))


def parse_colmap_stats(sparse_dir: str) -> Dict[str, int]:
    """COLMAP 산출물에서 등록 이미지 수·점군 수를 읽는다.

    `points3D.txt` / `images.txt` 는 '#' 주석 헤더 뒤에 레코드가 온다.
    images.txt 는 이미지 1장이 **2줄**(포즈 + 관측점)을 차지한다.
    """
    stats = {"registered_images": 0, "point_count": 0}
    images_txt = os.path.join(sparse_dir, "images.txt")
    points_txt = os.path.join(sparse_dir, "points3D.txt")

    if os.path.exists(images_txt):
        lines = [
            ln for ln in _read_lines(images_txt) if ln.strip() and not ln.startswith("#")
        ]
        stats["registered_images"] = len(lines) // 2
    if os.path.exists(points_txt):
        stats["point_count"] = sum(
            1 for ln in _read_lines(points_txt) if ln.strip() and not ln.startswith("#")
        )
    return stats


def _read_lines(path: str) -> List[str]:
    with open(path, encoding="utf-8", errors="ignore") as f:
        return f.readlines()


def run_reconstruction(
    *,
    image_dir: str,
    work_dir: str,
    out_dir: str,
    scale_factor: float,
    scale_source: str,
    input_image_count: int,
    raw_volume_units: Optional[float] = None,
    on_stage: Optional[StageCallback] = None,
    runner: Callable[[List[str]], int] = None,
    iterations: int = SPLAT_ITERATIONS_QUALITY,
    voxel_size: Optional[float] = None,
) -> ReconstructionResult:
    """복원 전 과정을 실행하고 결과를 만든다.

    `runner` 를 주입하면 외부 바이너리 실행을 대체할 수 있다(GPU 없이 배선 검증).
    부피는 산출 점군(point_cloud.ply)에서 직접 잰다([[volume]]).
    `raw_volume_units` 를 명시하면 측정 대신 그 값을 쓴다(테스트·재계산용).
    """
    stage = on_stage or (lambda _s: None)
    exec_cmd = runner or _default_runner

    stage("MATCHING")
    cmds = colmap_commands(image_dir, work_dir)
    for cmd in cmds[:2]:
        exec_cmd(cmd)

    stage("RECONSTRUCTING")
    exec_cmd(cmds[2])
    stats = parse_colmap_stats(os.path.join(work_dir, "sparse", "0"))

    stage("SPLATTING")
    exec_cmd(splat_command(work_dir, out_dir, iterations))

    stage("MEASURING")
    splat_path = os.path.join(out_dir, "point_cloud.ply")

    # 부피는 산출 점군에서 직접 잰다. 측정 실패는 부피 0 으로 두고 게이트가 걸러낸다
    # (숫자를 지어내는 것보다 "못 쟀다"가 낫다).
    measurement = None if raw_volume_units is not None else measure_ply(splat_path, voxel_size)
    volume_units = raw_volume_units if raw_volume_units is not None else (
        measurement.raw_volume_units if measurement else 0.0
    )

    quality = ScanQuality(
        registered_ratio=registered_ratio(stats["registered_images"], input_image_count),
        point_count=stats["point_count"],
        # 형상이 닫혀 있는지는 격자 커버리지로 판정한다([[volume]]).
        watertight=measurement.watertight if measurement else volume_units > 0,
    )
    usable, reasons = assess_scan_usability(quality, scale_source)
    if measurement and not measurement.watertight:
        reasons = list(reasons)

    return ReconstructionResult(
        gross_volume_m3=scaled_volume_m3(volume_units, scale_factor),
        raw_volume_units=volume_units,
        scale_source=scale_source,
        quality=quality,
        usable=usable,
        reasons=reasons,
        splat_path=splat_path,
        mesh_path=os.path.join(out_dir, "mesh.glb"),
        frame_count=input_image_count,
        measurement=measurement,
    )


def _default_runner(cmd: List[str]) -> int:
    """실제 외부 명령 실행. 실패하면 예외를 올려 잡을 실패로 만든다."""
    result = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"{cmd[0]} 실패(코드 {result.returncode}): {result.stderr[-500:]}")
    return result.returncode


def extract_frames_command(video_path: str, out_dir: str, fps: int = 3) -> List[str]:
    """영상 → 프레임 명령(frames 모듈 재노출 — 파이프라인 사용자가 한 곳만 보게)."""
    return ffmpeg_extract_command(video_path, out_dir, fps)


def result_to_json(result: ReconstructionResult) -> str:
    return json.dumps(result.as_dict(), ensure_ascii=False, indent=2)
