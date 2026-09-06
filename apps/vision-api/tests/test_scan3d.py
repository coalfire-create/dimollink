"""3D 스캔 복원 — GPU 없이 검증 가능한 부분 전부.

GPU 를 켜는 시간이 곧 비용이라, 배선 오류·계산 실수는 전부 여기서 잡고 올라간다.
"""

from __future__ import annotations

import os

from app.scan3d import (
    ScanQuality,
    assess_scan_usability,
    pick_sharpest_per_bucket,
    scaled_volume_m3,
    select_frame_indices,
)
from app.scan3d.frames import (
    MAX_SCAN_FRAMES,
    MIN_SCAN_FRAMES,
    enough_frames,
    ffmpeg_extract_command,
    sharpness_of,
)
from app.scan3d.pipeline import (
    colmap_commands,
    parse_colmap_stats,
    result_to_json,
    run_reconstruction,
    splat_command,
)
from app.scan3d.quality import registered_ratio, scale_factor_from_ledger_area


# ── 프레임 선별 ──────────────────────────────────────────────────────────────

def test_select_frames_is_evenly_spaced():
    picked = select_frame_indices(600, 200)
    assert len(picked) == 200
    gaps = {picked[i + 1] - picked[i] for i in range(len(picked) - 1)}
    # 간격이 벌어지면 인접 사진의 겹침이 줄어 복원이 깨진다 — 균등해야 한다.
    assert max(gaps) - min(gaps) <= 1


def test_select_frames_keeps_all_when_few():
    assert select_frame_indices(30, 200) == list(range(30))
    assert select_frame_indices(0, 200) == []


def test_pick_sharpest_per_bucket_avoids_blurry_frames():
    # 구간마다 흐린 프레임 2장 + 선명한 1장. 선명한 것만 골라야 한다.
    sharpness = []
    for _ in range(4):
        sharpness += [1.0, 900.0, 2.0]
    picked = pick_sharpest_per_bucket(sharpness, target=4)
    assert picked == [1, 4, 7, 10]


def test_pick_sharpest_keeps_even_spacing():
    picked = pick_sharpest_per_bucket([float(i % 7) for i in range(300)], target=100)
    assert len(picked) == 100
    assert picked == sorted(picked)


def test_sharpness_discriminates_focus():
    side = 24
    def image(fn):
        return [float(fn(x, y)) for y in range(side) for x in range(side)]
    sharp = sharpness_of(image(lambda x, y: 0 if (x + y) % 2 == 0 else 255), side, side)
    blurry = sharpness_of(image(lambda x, y: x / side * 255), side, side)
    assert sharp > blurry
    assert sharpness_of(image(lambda x, y: 128), side, side) == 0.0


def test_enough_frames_gate():
    assert enough_frames(MIN_SCAN_FRAMES) is None
    msg = enough_frames(10)
    assert msg and "다시 촬영" in msg


def test_ffmpeg_command_shape():
    cmd = ffmpeg_extract_command("/tmp/a.mp4", "/tmp/out", fps=3)
    assert cmd[0] == "ffmpeg"
    assert "fps=3" in " ".join(cmd)


# ── 부피·스케일 ──────────────────────────────────────────────────────────────

def test_scaled_volume_uses_cube_of_scale():
    """길이 배율의 세제곱을 곱해야 한다. 제곱을 곱하면 그럴듯하게 틀린다."""
    assert scaled_volume_m3(10, 2) == 80  # 10 × 2³
    assert scaled_volume_m3(10, 1) == 10
    assert scaled_volume_m3(0, 2) == 0.0
    assert scaled_volume_m3(10, 0) == 0.0


def test_scale_factor_from_ledger_area_is_sqrt_of_area_ratio():
    assert abs(scale_factor_from_ledger_area(25, 100) - 2.0) < 1e-9
    assert scale_factor_from_ledger_area(0, 100) is None
    assert scale_factor_from_ledger_area(25, 0) is None


def test_registered_ratio_clamps():
    assert registered_ratio(70, 100) == 0.7
    assert registered_ratio(0, 0) == 0.0
    assert registered_ratio(120, 100) == 1.0


# ── 품질 게이트 (scan-volume.ts 와 동일 규칙) ────────────────────────────────

def test_quality_gate_matches_ts_rules():
    good = ScanQuality(0.95, 250_000, True)
    assert assess_scan_usability(good, "AR_POSE") == (True, [])

    usable, reasons = assess_scan_usability(ScanQuality(0.4, 250_000, True), "AR_POSE")
    assert not usable and "다시 촬영" in " ".join(reasons)

    usable, _ = assess_scan_usability(ScanQuality(0.95, 500, True), "AR_POSE")
    assert not usable

    usable, reasons = assess_scan_usability(good, "NONE")
    assert not usable and "치수" in " ".join(reasons)

    usable, reasons = assess_scan_usability(ScanQuality(0.95, 250_000, False), "AR_POSE")
    assert not usable and "뚫린" in " ".join(reasons)


# ── COLMAP 명령·출력 파싱 ────────────────────────────────────────────────────

def test_colmap_commands_use_sequential_matcher_with_loop_detection():
    cmds = colmap_commands("/img", "/work")
    joined = [" ".join(c) for c in cmds]
    # 한 바퀴 촬영에는 순차 매칭 + 루프 감지가 exhaustive 보다 훨씬 빠르다.
    assert any("sequential_matcher" in j for j in joined)
    assert any("loop_detection 1" in j for j in joined)
    # 무늬 없는 벽이 많아 특징점을 기본값보다 많이 뽑아야 한다.
    assert any("max_num_features 16384" in j for j in joined)


def test_colmap_gpu_flag_can_be_disabled():
    joined = " ".join(" ".join(c) for c in colmap_commands("/img", "/work", use_gpu=False))
    assert "use_gpu 0" in joined


def test_splat_command_carries_iterations():
    assert "--max_steps 7000" in " ".join(splat_command("/w", "/o", 7000))


def test_parse_colmap_stats_counts_two_lines_per_image(tmp_path):
    sparse = tmp_path / "sparse"
    sparse.mkdir()
    # images.txt 는 이미지 1장이 2줄(포즈 + 관측점)을 차지한다.
    (sparse / "images.txt").write_text(
        "# 주석\n1 0 0 0 1 0 0 0 1 a.jpg\n1 2 3\n2 0 0 0 1 0 0 0 1 b.jpg\n4 5 6\n",
        encoding="utf-8",
    )
    (sparse / "points3D.txt").write_text("# 주석\n1 0 0 0\n2 1 1 1\n3 2 2 2\n", encoding="utf-8")

    stats = parse_colmap_stats(str(sparse))
    assert stats["registered_images"] == 2
    assert stats["point_count"] == 3


def test_parse_colmap_stats_on_missing_output():
    assert parse_colmap_stats("/does/not/exist") == {"registered_images": 0, "point_count": 0}


# ── 전 과정 배선 (GPU 없이) ──────────────────────────────────────────────────

def test_run_reconstruction_wiring_without_gpu(tmp_path):
    """외부 바이너리를 주입 대체해 단계 전이·결과 계산만 검증한다."""
    work = tmp_path / "work"
    (work / "sparse" / "0").mkdir(parents=True)
    (work / "sparse" / "0" / "images.txt").write_text(
        "".join(f"{i} p\n obs\n" for i in range(90)), encoding="utf-8"
    )
    (work / "sparse" / "0" / "points3D.txt").write_text(
        "".join(f"{i} 0 0 0\n" for i in range(200_000)), encoding="utf-8"
    )

    ran: list = []
    stages: list = []
    result = run_reconstruction(
        image_dir=str(tmp_path / "img"),
        work_dir=str(work),
        out_dir=str(tmp_path / "out"),
        scale_factor=2.0,
        scale_source="AR_POSE",
        raw_volume_units=50.0,
        input_image_count=100,
        on_stage=stages.append,
        runner=lambda cmd: ran.append(cmd[0]) or 0,
    )

    assert stages == ["MATCHING", "RECONSTRUCTING", "SPLATTING", "MEASURING"]
    assert ran.count("colmap") == 3 and ran.count("python") == 1
    assert result.quality.registered_ratio == 0.9
    assert result.quality.point_count == 200_000
    assert result.gross_volume_m3 == 400.0  # 50 × 2³
    assert result.usable is True
    assert "grossVolumeM3" in result_to_json(result)


def test_run_reconstruction_reports_unusable_on_poor_registration(tmp_path):
    work = tmp_path / "work"
    (work / "sparse" / "0").mkdir(parents=True)
    (work / "sparse" / "0" / "images.txt").write_text(
        "".join(f"{i} p\n obs\n" for i in range(20)), encoding="utf-8"
    )
    (work / "sparse" / "0" / "points3D.txt").write_text("1 0 0 0\n", encoding="utf-8")

    result = run_reconstruction(
        image_dir=str(tmp_path / "img"), work_dir=str(work), out_dir=str(tmp_path / "out"),
        scale_factor=1.0, scale_source="AR_POSE", raw_volume_units=10.0,
        input_image_count=100, runner=lambda cmd: 0,
    )
    # 100장 중 20장만 정렬 → 부피를 믿을 수 없다.
    assert result.usable is False
    assert any("다시 촬영" in r for r in result.reasons)


# ── 추출 fps: 흐림 선별이 실제로 작동하는가 (성능 측정에서 잡힌 결함) ──────────

def test_extract_fps_creates_selection_surplus():
    """목표와 같은 수만 뽑으면 구간당 후보가 1장뿐이라 흐림 필터가 무력해진다.

    이전 설계(3fps)에서는 30초=90장 → 상한 이하라 전부 통과했고,
    흔들린 프레임이 그대로 COLMAP 에 들어가 복원 실패의 원인이 됐다.
    """
    from app.scan3d.frames import (
        MIN_SELECTION_SURPLUS, SCAN_EXTRACT_FPS, TARGET_SCAN_FRAMES,
        selection_surplus, surplus_warning,
    )
    for seconds in (45, 60):  # 권장 촬영 시간(실측 무릎점 45초 이상)
        extracted = seconds * SCAN_EXTRACT_FPS
        assert selection_surplus(extracted) >= MIN_SELECTION_SURPLUS
        assert surplus_warning(extracted) is None


def test_surplus_warning_fires_when_too_short():
    from app.scan3d.frames import SCAN_EXTRACT_FPS, surplus_warning
    msg = surplus_warning(20 * SCAN_EXTRACT_FPS)  # 20초 — 너무 짧다
    assert msg and "여유가 없습니다" in msg


def _sharp_ratio_after_selection(seconds: int) -> float:
    """3장 중 1장만 선명한 영상에서, 선별 후 선명 프레임 비율(실측용 헬퍼)."""
    from app.scan3d.frames import SCAN_EXTRACT_FPS, TARGET_SCAN_FRAMES

    extracted = seconds * SCAN_EXTRACT_FPS
    sharpness = [900.0 if i % 3 == 0 else 5.0 for i in range(extracted)]
    picked = pick_sharpest_per_bucket(sharpness, TARGET_SCAN_FRAMES)
    assert len(picked) == TARGET_SCAN_FRAMES
    return sum(1 for i in picked if sharpness[i] > 100) / len(picked)


def test_selection_beats_random_at_30s():
    """30초에서도 무작위 추출보다는 낫다 — 다만 절반 남짓에 그친다.

    구간당 후보가 1.6장뿐이라서다. 권장 하한을 45초로 올린 실제 근거가 이 수치다.
    """
    ratio = _sharp_ratio_after_selection(30)
    assert ratio > 1 / 3 * 1.4  # 무작위(33%) 대비 유의미한 개선
    assert ratio > 0.5


def test_longer_capture_filters_blur_much_better():
    """여유가 늘면 선별 효과가 실제로 커진다 — '더 돌면 정확해진다'는 안내의 근거."""
    short = _sharp_ratio_after_selection(30)
    recommended = _sharp_ratio_after_selection(45)
    full = _sharp_ratio_after_selection(60)
    assert full > recommended > short
    # 45초(구간당 2.4장)에서 80%, 60초(3.2장)면 사실상 전부 선명한 프레임만 남는다.
    assert recommended >= 0.8
    assert full > 0.9


def test_selection_surplus_handles_zero_target():
    from app.scan3d.frames import selection_surplus
    assert selection_surplus(100, 0) == 0.0


# ── 보행 거리 스케일 (scan-volume.ts 미러) ──────────────────────────────────

def test_walking_scale_matches_ts_rules():
    from app.scan3d.quality import (
        DEFAULT_STRIDE_M, MIN_STEPS_FOR_SCALE,
        scale_factor_from_walking, stride_length_m,
    )
    # 100걸음 × 0.7m = 70m 를 복원 35단위로 걸었으면 배율 2.
    assert abs(scale_factor_from_walking(100, 35) - 2.0) < 1e-9
    assert stride_length_m() == DEFAULT_STRIDE_M
    assert stride_length_m(170) > stride_length_m(150)
    # 제자리 촬영은 못 쓴다.
    assert scale_factor_from_walking(MIN_STEPS_FOR_SCALE - 1, 35) is None
    assert scale_factor_from_walking(100, 0) is None


def test_resolve_scale_prefers_walking_over_ledger():
    from app.scan3d.quality import resolve_scale
    source, factor = resolve_scale(
        steps=100, path_length_units=35,
        reconstructed_floor_area_units=25, ledger_total_floor_area_m2=100,
    )
    assert source == "WALKING_DISTANCE" and abs(factor - 2.0) < 1e-9

    source, _ = resolve_scale(reconstructed_floor_area_units=25, ledger_total_floor_area_m2=100)
    assert source == "LEDGER_AREA"

    assert resolve_scale()[0] == "NONE"
    # AR 포즈는 무조건 최우선.
    assert resolve_scale(ar_pose_factor=1.5, steps=100, path_length_units=35)[0] == "AR_POSE"


def test_camera_path_length_from_colmap_poses(tmp_path):
    """카메라가 x축으로 0→1→2 이동하면 경로 길이는 2."""
    from app.scan3d.pipeline import camera_path_length
    sparse = tmp_path / "sparse"
    sparse.mkdir()
    (sparse / "images.txt").write_text(
        "# c\n1 1 0 0 0 0 0 0 1 a.jpg\n o\n2 1 0 0 0 -1 0 0 1 b.jpg\n o\n"
        "3 1 0 0 0 -2 0 0 1 c.jpg\n o\n",
        encoding="utf-8",
    )
    assert abs(camera_path_length(str(sparse)) - 2.0) < 1e-9
    assert camera_path_length("/nope") == 0.0


# ── 사전 점검 · 학습 명령 (GPU 시간 낭비 방지) ───────────────────────────────

def test_splat_command_uses_gsplat_example_script_not_a_module():
    """gsplat 은 트레이너를 모듈로 설치하지 않는다.

    `python -m gsplat.trainer` 로 두면 COLMAP 이 15분 돌아간 **뒤에** 실패해
    GPU 시간을 통째로 날린다.
    """
    from app.scan3d.pipeline import splat_command
    cmd = splat_command("/w", "/o", 7000)
    assert "-m" not in cmd
    assert cmd[1].endswith("simple_trainer.py")
    # tyro CLI 라 전략(default)이 첫 인자로 와야 한다.
    assert cmd[2] == "default"
    joined = " ".join(cmd)
    assert "--data_dir /w" in joined and "--max_steps 7000" in joined


def test_splat_command_accepts_custom_trainer():
    from app.scan3d.pipeline import splat_command
    assert splat_command("/w", "/o", 100, trainer_script="/opt/train.py")[1] == "/opt/train.py"


def test_preflight_reports_every_missing_dependency(tmp_path):
    """문제를 하나만 알려주고 끝나면 고치고 또 실패한다 — 전부 모아서 낸다."""
    from app.scan3d.pipeline import preflight_checks
    problems = preflight_checks(str(tmp_path / "nope.py"))
    joined = " ".join(problems)
    # 로컬에는 ffmpeg·colmap·GPU 가 없으므로 전부 잡혀야 한다.
    assert "ffmpeg" in joined
    assert "colmap" in joined
    assert "학습 스크립트" in joined
    assert "nvidia-smi" in joined


def test_preflight_passes_when_trainer_exists(tmp_path):
    """존재하는 스크립트를 주면 그 항목은 문제 목록에서 빠진다."""
    from app.scan3d.pipeline import preflight_checks
    script = tmp_path / "simple_trainer.py"
    script.write_text("", encoding="utf-8")
    problems = preflight_checks(str(script))
    assert not any("학습 스크립트" in p for p in problems)


def test_run_reconstruction_can_fall_back_to_cpu_colmap(tmp_path):
    """apt 판 COLMAP 은 CPU 전용일 수 있다 — use_gpu=False 로 내려가도 동작해야 한다."""
    from app.scan3d.pipeline import run_reconstruction
    work = tmp_path / "work"
    (work / "sparse" / "0").mkdir(parents=True)
    (work / "sparse" / "0" / "images.txt").write_text("", encoding="utf-8")
    (work / "sparse" / "0" / "points3D.txt").write_text("", encoding="utf-8")

    seen: list = []
    run_reconstruction(
        image_dir=str(tmp_path / "img"), work_dir=str(work), out_dir=str(tmp_path / "out"),
        scale_factor=1.0, scale_source="AR_POSE", input_image_count=10,
        raw_volume_units=1.0, use_gpu=False,
        runner=lambda cmd: seen.append(" ".join(cmd)) or 0,
    )
    assert any("use_gpu 0" in c for c in seen)
