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
SCALE_LEDGER_AREA = "LEDGER_AREA"
SCALE_NONE = "NONE"


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
