"""복원 품질 판정 · 스케일 환산.

⚠️ 단일 원천은 `packages/shared/src/scan-volume.ts`. 여기는 Python 미러.

철거 현장은 포토그래메트리에 불리하다 — 도장 콘크리트·판넬은 특징점이 없고, 유리·금속은
보는 각도마다 색이 달라 복원이 깨진다. 나쁜 스캔의 부피를 그대로 쓰면 연면적 원단위 추정보다
오히려 나빠지므로, 반드시 게이트를 통과시킨 뒤에만 물량 산정에 넘긴다.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Tuple

# scan-volume.ts 미러
MIN_REGISTERED_RATIO = 0.7
MIN_POINT_COUNT = 20_000

SCALE_AR_POSE = "AR_POSE"
SCALE_REFERENCE_OBJECT = "REFERENCE_OBJECT"
SCALE_WALKING_DISTANCE = "WALKING_DISTANCE"
SCALE_LEDGER_AREA = "LEDGER_AREA"
SCALE_NONE = "NONE"

# scan-volume.ts 미러 — 보폭은 키의 0.415배, 모르면 평균값.
STRIDE_TO_HEIGHT_RATIO = 0.415
DEFAULT_STRIDE_M = 0.7
MIN_STEPS_FOR_SCALE = 15


@dataclass
class ScanQuality:
    """복원 결과의 신뢰 근거. TS `Scan3DQuality` 와 필드가 1:1 대응한다."""

    registered_ratio: float
    point_count: int
    watertight: bool

    def as_dict(self) -> dict:
        return {
            "registeredRatio": round(self.registered_ratio, 4),
            "pointCount": self.point_count,
            "watertight": self.watertight,
        }


def assess_scan_usability(quality: ScanQuality, scale_source: str) -> Tuple[bool, List[str]]:
    """부피를 물량 산정에 쓸 수 있는지. (사용 가능 여부, 사유 목록)."""
    reasons: List[str] = []
    if scale_source == SCALE_NONE:
        reasons.append("실제 치수 기준이 없어 부피를 계산할 수 없습니다.")
    if quality.registered_ratio < MIN_REGISTERED_RATIO:
        reasons.append(
            f"사진의 {round(quality.registered_ratio * 100)}%만 정렬됐습니다. "
            "겹치도록 천천히 한 바퀴 다시 촬영해 주세요."
        )
    if quality.point_count < MIN_POINT_COUNT:
        reasons.append("복원된 형상이 너무 성깁니다(무늬 없는 벽면·반사면이 많을 때 생깁니다).")
    if not quality.watertight:
        reasons.append("외형에 뚫린 곳이 있어 부피가 실제보다 작게 나올 수 있습니다.")
    return (len(reasons) == 0, reasons)


def scale_factor_from_ledger_area(
    reconstructed_floor_area_units: float, ledger_total_floor_area_m2: float
) -> Optional[float]:
    """대장 연면적으로 길이 배율을 역산. 면적비의 제곱근이다(길이 배율이므로)."""
    if reconstructed_floor_area_units <= 0 or ledger_total_floor_area_m2 <= 0:
        return None
    return (ledger_total_floor_area_m2 / reconstructed_floor_area_units) ** 0.5


def stride_length_m(height_cm: Optional[float] = None) -> float:
    """보폭 추정(m). 걷기 보폭은 키에 거의 비례한다."""
    if not height_cm or height_cm < 120 or height_cm > 220:
        return DEFAULT_STRIDE_M
    return round(height_cm / 100 * STRIDE_TO_HEIGHT_RATIO, 3)


def scale_factor_from_walking(
    steps: float, reconstructed_path_length_units: float, height_cm: Optional[float] = None
) -> Optional[float]:
    """걸음수 × 보폭 ÷ 복원 카메라 경로 길이 = 길이 배율.

    경로끼리의 비라 제곱근·세제곱 변환이 없다. 제자리 촬영(걸음수 부족)은 못 쓴다.
    """
    if steps < MIN_STEPS_FOR_SCALE or reconstructed_path_length_units <= 0:
        return None
    return steps * stride_length_m(height_cm) / reconstructed_path_length_units


# reference-object.ts 미러 — 배율 위생 검사 범위.
MIN_PLAUSIBLE_SCALE = 0.001
MAX_PLAUSIBLE_SCALE = 1000


def scale_factor_from_reference(
    real_length_m: float, measured_units: float
) -> Optional[float]:
    """기준 물체 실제 길이 ÷ 복원 좌표계에서 잰 길이 = 길이 배율.

    범위를 벗어나면 잘못된 지점을 잰 것이다 — 그대로 쓰면 부피가 세제곱으로 틀린다.
    """
    if real_length_m <= 0 or measured_units <= 0:
        return None
    factor = real_length_m / measured_units
    if factor < MIN_PLAUSIBLE_SCALE or factor > MAX_PLAUSIBLE_SCALE:
        return None
    return factor


def volume_from_raw_units(raw_volume_units: float, scale_factor: float) -> float:
    """복원 좌표계 원시 부피 → ㎥. 배율의 세제곱. 복원 재실행 없이 재계산할 때 쓴다."""
    if raw_volume_units <= 0 or scale_factor <= 0:
        return 0.0
    return raw_volume_units * (scale_factor ** 3)


def resolve_scale(
    *,
    ar_pose_factor: Optional[float] = None,
    reference_factor: Optional[float] = None,
    steps: Optional[float] = None,
    path_length_units: Optional[float] = None,
    height_cm: Optional[float] = None,
    reconstructed_floor_area_units: Optional[float] = None,
    ledger_total_floor_area_m2: Optional[float] = None,
) -> Tuple[str, Optional[float]]:
    """가진 근거 중 가장 정확한 것을 골라 (출처, 배율)을 낸다. scan-volume.ts 와 동일 순서."""
    if ar_pose_factor and ar_pose_factor > 0:
        return (SCALE_AR_POSE, ar_pose_factor)

    if reference_factor and reference_factor > 0:
        return (SCALE_REFERENCE_OBJECT, reference_factor)

    walking = scale_factor_from_walking(steps or 0, path_length_units or 0, height_cm)
    if walking:
        return (SCALE_WALKING_DISTANCE, walking)

    ledger = scale_factor_from_ledger_area(
        reconstructed_floor_area_units or 0, ledger_total_floor_area_m2 or 0
    )
    if ledger:
        return (SCALE_LEDGER_AREA, ledger)

    return (SCALE_NONE, None)


def scaled_volume_m3(raw_volume_units: float, scale_factor: float) -> float:
    """복원 좌표계 부피 → 실제 ㎥. 길이 배율의 **세제곱**을 곱한다.

    여기서 제곱을 곱하는 실수를 하면 부피가 통째로 틀린다(그리고 그럴듯해 보인다).
    """
    if raw_volume_units <= 0 or scale_factor <= 0:
        return 0.0
    return raw_volume_units * (scale_factor ** 3)


def registered_ratio(registered_images: int, input_images: int) -> float:
    """COLMAP 이 등록한 이미지 비율. 입력이 0이면 0."""
    if input_images <= 0:
        return 0.0
    return min(1.0, registered_images / input_images)
