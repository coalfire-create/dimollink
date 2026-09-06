"""외피 부피 측정 (기둥 채우기) — GPU 없이 전부 검증.

부피가 틀리면 물량 산정이 통째로 틀리는데, 숫자가 그럴듯해서 눈으로는 못 잡는다.
알려진 형상으로 값을 못 박아 둔다.
"""

from __future__ import annotations

import math
import struct

from app.scan3d.volume import (
    MIN_COLUMN_COVERAGE,
    auto_voxel_size,
    bounding_box_volume,
    measure_ply,
    measure_volume,
    read_ply_points,
)


def box_surface(w: float, d: float, h: float, step: float = 0.1):
    """가로 w × 세로 d × 높이 h 상자의 위·아래 면 점군(밖에서 찍은 건물 근사)."""
    pts = []
    nx, ny = int(w / step) + 1, int(d / step) + 1
    for i in range(nx):
        for j in range(ny):
            x, y = i * step, j * step
            pts.append((x, y, 0.0))
            pts.append((x, y, h))
    return pts


def test_box_volume_is_accurate_with_auto_voxel():
    """10×10×3 = 300. 격자를 자동으로 정하면 오차가 몇 % 안쪽이다."""
    m = measure_volume(box_surface(10, 10, 3))
    assert m.watertight is True
    assert m.column_coverage == 1.0
    assert abs(m.raw_volume_units - 300) < 300 * 0.06


def test_auto_voxel_beats_manual_extremes():
    """자동 선택이 너무 큰/작은 수동 격자보다 정확해야 한다."""
    auto = measure_volume(box_surface(10, 10, 3))
    coarse = measure_volume(box_surface(10, 10, 3), voxel_size=1.0)
    too_fine = measure_volume(box_surface(10, 10, 3), voxel_size=0.1)
    err = lambda m: abs(m.raw_volume_units - 300)
    assert err(auto) < err(coarse)
    assert err(auto) < err(too_fine)


def test_voxel_smaller_than_point_spacing_halves_the_volume():
    """격자가 점 간격보다 촘촘하면 기둥 사이가 비어 부피가 과소평가된다.

    이 실패가 위험한 이유는 값이 그럴듯해서다 — 물량이 조용히 반토막 난다.
    그래서 격자를 수동으로 받지 않고 점 밀도에서 자동으로 정하는 것이 기본값이다.
    """
    pts = box_surface(10, 10, 3, step=0.1)
    broken = measure_volume(pts, voxel_size=0.1)  # 점 간격과 같은 격자
    assert broken.raw_volume_units < 300 * 0.6
    # 커버리지 게이트가 2차 방어선으로 이걸 잡아야 한다.
    assert broken.watertight is False


def test_auto_voxel_size_scales_with_density():
    sparse = auto_voxel_size(box_surface(10, 10, 3, step=1.0))
    dense = auto_voxel_size(box_surface(10, 10, 3, step=0.1))
    assert sparse > dense  # 점이 성길수록 격자를 크게 잡아야 구멍이 안 생긴다


def test_volume_scales_with_height():
    low = measure_volume(box_surface(10, 10, 3)).raw_volume_units
    high = measure_volume(box_surface(10, 10, 6)).raw_volume_units
    # 층고가 2배면 부피도 2배 — 연면적 원단위가 못 보는 바로 그 차이다.
    assert abs(high / low - 2.0) < 0.02


def test_courtyard_is_not_counted():
    """ㄷ자 건물의 안뜰은 부피에서 빠져야 한다(볼록껍질이라면 세어버린다)."""
    full = box_surface(10, 10, 3)
    # 가운데 4×4 구역의 점을 제거 = 안뜰.
    with_hole = [p for p in full if not (3 <= p[0] <= 7 and 3 <= p[1] <= 7)]
    m_full = measure_volume(full, 0.25)
    m_hole = measure_volume(with_hole, 0.25)
    assert m_hole.raw_volume_units < m_full.raw_volume_units
    # 안뜰(4×4×3=48)만큼 줄어야 한다.
    assert 35 < (m_full.raw_volume_units - m_hole.raw_volume_units) < 60


def test_sparse_scan_is_not_watertight():
    """무늬 없는 벽면처럼 점이 성기면 부피를 믿을 수 없다고 표시한다."""
    ring = [(math.cos(i / 50 * math.tau) * 5, math.sin(i / 50 * math.tau) * 5, 0.0)
            for i in range(50)]
    m = measure_volume(ring, 0.25)
    assert m.column_coverage < MIN_COLUMN_COVERAGE
    assert m.watertight is False


def test_ground_noise_does_not_inflate_volume():
    """지면 아래로 튄 이상점이 부피를 부풀리면 안 된다."""
    clean = box_surface(10, 10, 3)
    noisy = clean + [(5.0, 5.0, -50.0)]  # 지하 50m 로 튄 노이즈 1점
    v_clean = measure_volume(clean).raw_volume_units
    v_noisy = measure_volume(noisy).raw_volume_units
    assert abs(v_noisy - v_clean) < v_clean * 0.02


def test_volume_never_exceeds_bounding_box():
    """어떤 측정값도 경계상자를 넘을 수 없다 — 넘으면 계산 버그다."""
    for size in ((10, 10, 3), (4, 20, 8), (30, 5, 2)):
        m = measure_volume(box_surface(*size))
        assert m.raw_volume_units <= m.bbox_volume_units * 1.3  # 격자 여유분 포함


def test_degenerate_inputs():
    assert measure_volume([]).raw_volume_units == 0.0
    assert measure_volume([(0, 0, 0)]).watertight is False
    assert measure_volume(box_surface(10, 10, 3), 0).raw_volume_units == 0.0
    assert bounding_box_volume([]) == 0.0


# ── PLY 파서 ─────────────────────────────────────────────────────────────────

def _write_ply(path, points, binary=True, extra_props=0):
    """3DGS 산출물처럼 x,y,z 뒤에 속성이 더 붙은 PLY 를 만든다."""
    props = ["x", "y", "z"] + [f"f_dc_{i}" for i in range(extra_props)]
    header = "ply\n"
    header += "format binary_little_endian 1.0\n" if binary else "format ascii 1.0\n"
    header += f"element vertex {len(points)}\n"
    header += "".join(f"property float {p}\n" for p in props)
    header += "end_header\n"
    if binary:
        body = b"".join(
            struct.pack("<" + "f" * len(props), *p, *([0.0] * extra_props)) for p in points
        )
        open(path, "wb").write(header.encode() + body)
    else:
        lines = "".join(
            " ".join(str(v) for v in (*p, *([0.0] * extra_props))) + "\n" for p in points
        )
        open(path, "w").write(header + lines)


def test_reads_binary_ply_with_extra_gaussian_properties(tmp_path):
    """3DGS PLY 는 위치 뒤에 색·불투명도·스케일·회전이 줄줄이 붙는다."""
    path = str(tmp_path / "s.ply")
    pts = box_surface(4, 4, 2, step=0.5)
    _write_ply(path, pts, binary=True, extra_props=11)
    read = read_ply_points(path)
    assert len(read) == len(pts)
    assert read[0] == pts[0]


def test_reads_ascii_ply(tmp_path):
    path = str(tmp_path / "a.ply")
    pts = [(0.0, 0.0, 0.0), (1.0, 2.0, 3.0)]
    _write_ply(path, pts, binary=False)
    assert read_ply_points(path) == pts


def test_measure_ply_end_to_end(tmp_path):
    path = str(tmp_path / "box.ply")
    _write_ply(path, box_surface(10, 10, 3), binary=True, extra_props=11)
    m = measure_ply(path)
    assert m is not None
    assert abs(m.raw_volume_units - 300) < 300 * 0.06
    assert m.watertight is True


def test_measure_ply_returns_none_on_bad_file(tmp_path):
    """읽지 못하면 None — 호출부가 폴백한다(예외로 잡 전체를 죽이지 않는다)."""
    assert measure_ply(str(tmp_path / "missing.ply")) is None
    bad = tmp_path / "bad.ply"
    bad.write_text("not a ply", encoding="utf-8")
    assert measure_ply(str(bad)) is None
