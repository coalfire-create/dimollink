"""복원 점군 → 외피 부피 측정.

**왜 볼록껍질(convex hull)이 아니라 기둥 채우기(column fill)인가**

건물을 밖에서 한 바퀴 돌며 찍으면 점은 벽면과 지붕에만 생기고 내부는 비어 있다.
- 볼록껍질은 ㄱ자·ㄷ자 건물의 안뜰까지 부피로 세어 과대평가한다.
- 보로노이·포아송 메시는 벽면에 구멍이 있으면 닫히지 않아 부피가 안 나온다.

수평 격자(x, y)마다 **최저점~최고점 사이를 채우는** 방식이 건물 외피에는 정확히 맞는다.
지면부터 지붕까지가 곧 그 기둥의 부피고, 안뜰은 점이 없으니 자연히 빠진다.
오목한 형상도 처리되고, 구멍이 있어도 그 기둥만 빠질 뿐 전체가 실패하지 않는다.

trimesh·numpy 없이 순수 파이썬으로 구현했다 — GPU VM 을 켜기 전에 로컬에서
부피 계산이 맞는지 끝까지 검증할 수 있어야 하기 때문이다.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

Point = Tuple[float, float, float]

# 기본 격자 크기(복원 좌표계 단위). 스케일을 곱하기 전 값이라 무차원이다.
# 보통은 점 밀도에서 자동으로 정한다([[auto_voxel_size]]) — 이 값은 밀도를 못 잴 때의 폴백.
DEFAULT_VOXEL_SIZE = 0.25

# 격자 = 평균 점 간격 × 이 배수.
# ⚠️ 격자가 점 간격보다 촘촘하면 기둥 사이사이가 비어 **부피가 절반으로 과소평가**된다.
# (실측: 간격 0.1 점군에 격자 0.1 → 300 이 나와야 할 부피가 151, 커버리지 0.50.
#  커버리지 게이트를 아슬아슬하게 통과해 조용히 틀린 물량을 내놓는 경로였다.)
VOXEL_TO_SPACING_RATIO = 3.0

# 이 비율 미만의 기둥만 채워지면 형상이 너무 성긴 것으로 본다(watertight 대용).
# 0.5 는 격자가 너무 촘촘할 때의 실패 사례(커버리지 0.504)를 아슬아슬하게 통과시켰다 —
# 자동 격자 선택이 1차 방어선이고, 이 값은 여유를 둔 2차 방어선이다.
MIN_COLUMN_COVERAGE = 0.6

# 바닥 노이즈 제거 — 아래에서 이 비율만큼의 점은 지면으로 보고 기준면을 잡는다.
GROUND_PERCENTILE = 0.02


@dataclass
class VolumeMeasurement:
    """부피 측정 결과. `raw_volume_units` 를 스케일 세제곱과 곱해 ㎥ 가 된다."""

    raw_volume_units: float
    #: 점이 있는 기둥 수 / 바닥 넓이 격자 수. 형상이 촘촘한지의 지표.
    column_coverage: float
    #: 부피를 신뢰할 만큼 형상이 닫혀 있는지(watertight 대용).
    watertight: bool
    point_count: int
    #: 축 정렬 경계상자 부피 — 상한 위생 검사용(측정값이 이걸 넘으면 버그다).
    bbox_volume_units: float

    def as_dict(self) -> Dict:
        return {
            "rawVolumeUnits": round(self.raw_volume_units, 4),
            "columnCoverage": round(self.column_coverage, 4),
            "watertight": self.watertight,
            "pointCount": self.point_count,
            "bboxVolumeUnits": round(self.bbox_volume_units, 4),
        }


def auto_voxel_size(points: Sequence[Point]) -> float:
    """점 밀도에서 안전한 격자 크기를 정한다.

    바닥 넓이 / 점 수 로 평균 점 간격을 추정하고 그 몇 배를 격자로 쓴다.
    격자가 점 간격보다 작으면 빈 기둥이 생겨 부피가 과소평가되므로, 넉넉히 잡는다.
    """
    n = len(points)
    if n < 3:
        return DEFAULT_VOXEL_SIZE
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    width = max(xs) - min(xs)
    depth = max(ys) - min(ys)
    footprint = width * depth
    if footprint <= 0:
        return DEFAULT_VOXEL_SIZE
    spacing = (footprint / n) ** 0.5
    return max(spacing * VOXEL_TO_SPACING_RATIO, 1e-6)


def bounding_box_volume(points: Sequence[Point]) -> float:
    """축 정렬 경계상자 부피. 어떤 측정값도 이걸 넘을 수 없다(상한 검사)."""
    if len(points) < 2:
        return 0.0
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    zs = [p[2] for p in points]
    return (max(xs) - min(xs)) * (max(ys) - min(ys)) * (max(zs) - min(zs))


def _percentile(sorted_values: List[float], ratio: float) -> float:
    if not sorted_values:
        return 0.0
    idx = min(len(sorted_values) - 1, max(0, int(len(sorted_values) * ratio)))
    return sorted_values[idx]


def measure_volume(
    points: Sequence[Point], voxel_size: Optional[float] = None
) -> VolumeMeasurement:
    """점군 → 외피 부피(복원 좌표계 단위³).

    수평 격자마다 최저~최고 z 를 채운다. 지면 아래로 튄 노이즈는 하위
    `GROUND_PERCENTILE` 로 잡은 기준면에서 잘라낸다.

    `voxel_size` 를 주지 않으면 점 밀도에서 자동으로 정한다 — 수동으로 너무 작게
    주면 부피가 조용히 절반이 되므로, 자동 선택이 기본값이다.
    """
    n = len(points)
    if n < 3:
        return VolumeMeasurement(0.0, 0.0, False, n, 0.0)
    if voxel_size is None:
        voxel_size = auto_voxel_size(points)
    if voxel_size <= 0:
        return VolumeMeasurement(0.0, 0.0, False, n, 0.0)

    ground = _percentile(sorted(p[2] for p in points), GROUND_PERCENTILE)

    # (격자x, 격자y) → [최저 z, 최고 z]
    columns: Dict[Tuple[int, int], List[float]] = {}
    for x, y, z in points:
        if z < ground:
            z = ground  # 지면 아래 노이즈는 기준면으로 눌러 부피를 부풀리지 않는다.
        key = (int(x // voxel_size), int(y // voxel_size))
        col = columns.get(key)
        if col is None:
            columns[key] = [z, z]
        else:
            if z < col[0]:
                col[0] = z
            if z > col[1]:
                col[1] = z

    cell_area = voxel_size * voxel_size
    volume = sum(cell_area * (high - low) for low, high in columns.values())

    # 커버리지: 점이 있는 기둥 / 바닥 경계 안의 전체 격자.
    xs = [k[0] for k in columns]
    ys = [k[1] for k in columns]
    footprint_cells = (max(xs) - min(xs) + 1) * (max(ys) - min(ys) + 1)
    coverage = len(columns) / footprint_cells if footprint_cells > 0 else 0.0

    return VolumeMeasurement(
        raw_volume_units=volume,
        column_coverage=coverage,
        watertight=coverage >= MIN_COLUMN_COVERAGE and volume > 0,
        point_count=n,
        bbox_volume_units=bounding_box_volume(points),
    )


# ── PLY 읽기 (trimesh 없이) ──────────────────────────────────────────────────

def read_ply_points(path: str, max_points: int = 2_000_000) -> List[Point]:
    """PLY(binary_little_endian / ascii)에서 x,y,z 만 읽는다.

    3DGS 산출물은 가우시안 속성이 많이 붙지만 부피에 필요한 건 위치뿐이다.
    의존성을 늘리지 않으려고 최소 파서를 직접 둔다.
    """
    with open(path, "rb") as f:
        header_bytes = b""
        while b"end_header" not in header_bytes:
            chunk = f.readline()
            if not chunk:
                raise ValueError("PLY 헤더가 끝나지 않았습니다.")
            header_bytes += chunk
        header = header_bytes.decode("ascii", errors="ignore")
        fmt, count, props = _parse_ply_header(header)

        if fmt == "ascii":
            return _read_ascii(f, count, props, max_points)
        return _read_binary(f, count, props, max_points, little_endian=(fmt != "binary_big_endian"))


_TYPE_FORMAT = {
    "float": ("f", 4), "float32": ("f", 4), "double": ("d", 8), "float64": ("d", 8),
    "uchar": ("B", 1), "uint8": ("B", 1), "char": ("b", 1), "int8": ("b", 1),
    "ushort": ("H", 2), "uint16": ("H", 2), "short": ("h", 2), "int16": ("h", 2),
    "uint": ("I", 4), "uint32": ("I", 4), "int": ("i", 4), "int32": ("i", 4),
}


def _parse_ply_header(header: str) -> Tuple[str, int, List[Tuple[str, str]]]:
    fmt = "ascii"
    count = 0
    props: List[Tuple[str, str]] = []
    in_vertex = False
    for line in header.splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "format":
            fmt = parts[1]
        elif parts[0] == "element":
            in_vertex = parts[1] == "vertex"
            if in_vertex:
                count = int(parts[2])
        elif parts[0] == "property" and in_vertex and parts[1] != "list":
            props.append((parts[2], parts[1]))  # (이름, 타입)
    return fmt, count, props


def _read_binary(f, count: int, props, max_points: int, little_endian: bool) -> List[Point]:
    endian = "<" if little_endian else ">"
    fmt = endian + "".join(_TYPE_FORMAT[t][0] for _, t in props)
    size = struct.calcsize(fmt)
    names = [n for n, _ in props]
    try:
        ix, iy, iz = names.index("x"), names.index("y"), names.index("z")
    except ValueError as exc:
        raise ValueError("PLY 에 x/y/z 속성이 없습니다.") from exc

    step = max(1, count // max_points) if count > max_points else 1
    out: List[Point] = []
    for i in range(count):
        raw = f.read(size)
        if len(raw) < size:
            break
        if i % step:
            continue
        v = struct.unpack(fmt, raw)
        out.append((float(v[ix]), float(v[iy]), float(v[iz])))
    return out


def _read_ascii(f, count: int, props, max_points: int) -> List[Point]:
    names = [n for n, _ in props]
    try:
        ix, iy, iz = names.index("x"), names.index("y"), names.index("z")
    except ValueError as exc:
        raise ValueError("PLY 에 x/y/z 속성이 없습니다.") from exc
    step = max(1, count // max_points) if count > max_points else 1
    out: List[Point] = []
    for i in range(count):
        line = f.readline()
        if not line:
            break
        if i % step:
            continue
        v = line.split()
        out.append((float(v[ix]), float(v[iy]), float(v[iz])))
    return out


def measure_ply(
    path: str, voxel_size: Optional[float] = None
) -> Optional[VolumeMeasurement]:
    """PLY 파일에서 바로 부피를 잰다. 읽지 못하면 None(호출부가 폴백)."""
    try:
        return measure_volume(read_ply_points(path), voxel_size)
    except (OSError, ValueError, struct.error):
        return None
