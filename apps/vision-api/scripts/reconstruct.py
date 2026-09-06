#!/usr/bin/env python3
"""3D 스캔 복원 CLI — 영상 1건 → 점군·부피.

    python scripts/reconstruct.py --video site.mp4 --out /tmp/scan \
        --scale-source AR_POSE --scale-factor 1.0

GPU VM 에서 돌린다. 배선·계산은 로컬에서 이미 검증했으므로(`pytest tests/test_scan3d.py`,
`tests/test_scan_volume.py`), 여기서는 실제 COLMAP·3DGS 만 확인하면 된다.

⚠️ 비용: 첫 실행은 `--fast` 로 확인할 것. 배선이 맞는지 6~8분에 알 수 있고,
30k 반복으로 25분 태운 뒤 실패하는 것보다 훨씬 싸다.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.scan3d.frames import (
    SCAN_EXTRACT_FPS,
    TARGET_SCAN_FRAMES,
    enough_frames,
    ffmpeg_extract_command,
    surplus_warning,
)
from app.scan3d.pipeline import (
    SPLAT_ITERATIONS_FAST,
    SPLAT_ITERATIONS_QUALITY,
    run_reconstruction,
)
from app.scan3d.quality import scale_factor_from_ledger_area


def main() -> int:
    p = argparse.ArgumentParser(description="디몰비전 3D 스캔 복원")
    p.add_argument("--video", required=True, help="한 바퀴 촬영 영상")
    p.add_argument("--out", default="/tmp/scan", help="작업·산출 디렉터리")
    p.add_argument("--fps", type=int, default=SCAN_EXTRACT_FPS)
    p.add_argument("--target-frames", type=int, default=TARGET_SCAN_FRAMES)
    p.add_argument(
        "--scale-source",
        default="NONE",
        choices=["AR_POSE", "REFERENCE_OBJECT", "LEDGER_AREA", "NONE"],
    )
    p.add_argument("--scale-factor", type=float, default=1.0, help="복원 좌표 → 미터 배율")
    p.add_argument("--ledger-area-m2", type=float, help="대장 연면적(스케일 역산용)")
    p.add_argument("--recon-floor-area", type=float, help="복원 좌표계 바닥면적(역산용)")
    p.add_argument("--fast", action="store_true", help="3DGS 7k 반복(배선 확인용, 저렴)")
    args = p.parse_args()

    images = os.path.join(args.out, "images")
    work = os.path.join(args.out, "work")
    out = os.path.join(args.out, "out")
    for d in (images, work, out):
        os.makedirs(d, exist_ok=True)

    # ① 프레임 추출 — 목표보다 넉넉히 뽑아야 흐림 선별이 의미를 갖는다.
    print("[1/2] 프레임 추출…", flush=True)
    subprocess.run(ffmpeg_extract_command(args.video, images, args.fps), check=True)
    frames = sorted(f for f in os.listdir(images) if f.endswith(".jpg"))
    print(f"      {len(frames)}장 추출")

    problem = enough_frames(len(frames))
    if problem:
        print(f"[중단] {problem}", file=sys.stderr)
        return 1
    warning = surplus_warning(len(frames), args.target_frames)
    if warning:
        print(f"[경고] {warning}", file=sys.stderr)

    # ② 스케일 결정 — AR 포즈가 없으면 대장 연면적으로 역산한다.
    scale_factor = args.scale_factor
    if args.scale_source == "LEDGER_AREA" and args.ledger_area_m2 and args.recon_floor_area:
        derived = scale_factor_from_ledger_area(args.recon_floor_area, args.ledger_area_m2)
        if derived:
            scale_factor = derived
            print(f"      대장 역산 배율 {scale_factor:.4f}")

    # ③ COLMAP + 3DGS + 부피
    print("[2/2] 복원…", flush=True)
    result = run_reconstruction(
        image_dir=images,
        work_dir=work,
        out_dir=out,
        scale_factor=scale_factor,
        scale_source=args.scale_source,
        input_image_count=len(frames),
        on_stage=lambda s: print(f"      → {s}", flush=True),
        iterations=SPLAT_ITERATIONS_FAST if args.fast else SPLAT_ITERATIONS_QUALITY,
    )

    print(json.dumps(result.as_dict(), ensure_ascii=False, indent=2))
    if not result.usable:
        print("[주의] 이 스캔은 물량 산정에 쓸 수 없습니다:", file=sys.stderr)
        for reason in result.reasons:
            print(f"  - {reason}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
