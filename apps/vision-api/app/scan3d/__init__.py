"""3D 현장 스캔 복원 (COLMAP + 3D Gaussian Splatting).

⚠️ 계약의 단일 원천은 `packages/shared/src/site-scan-3d.ts` + `scan-volume.ts` 다.
이 패키지는 Python 측 미러이며, 상수를 바꿀 때는 양쪽을 함께 고쳐야 한다.

GPU 가 필요한 것은 COLMAP 매칭과 3DGS 학습뿐이다. 프레임 선별·품질 판정·부피 환산은
순수 함수라 GPU 없이 검증한다(그래야 GPU 를 켜는 시간을 최소로 줄일 수 있다).
"""

from .frames import select_frame_indices, sharpness_of, pick_sharpest_per_bucket
from .quality import (
    ScanQuality,
    assess_scan_usability,
    resolve_scale,
    scale_factor_from_reference,
    scale_factor_from_walking,
    volume_from_raw_units,
    scaled_volume_m3,
    stride_length_m,
)
from .pipeline import ReconstructionResult, camera_path_length, run_reconstruction
from .volume import (
    VolumeMeasurement,
    auto_voxel_size,
    measure_ply,
    measure_volume,
    read_ply_points,
)

__all__ = [
    "select_frame_indices",
    "sharpness_of",
    "pick_sharpest_per_bucket",
    "ScanQuality",
    "assess_scan_usability",
    "scaled_volume_m3",
    "resolve_scale",
    "scale_factor_from_walking",
    "scale_factor_from_reference",
    "volume_from_raw_units",
    "stride_length_m",
    "ReconstructionResult",
    "run_reconstruction",
    "camera_path_length",
    "VolumeMeasurement",
    "measure_volume",
    "measure_ply",
    "read_ply_points",
    "auto_voxel_size",
]
