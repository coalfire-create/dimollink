"""영상 → 복원용 프레임 선별.

한 바퀴 영상에서 프레임을 그냥 균등 추출하면 흔들린 프레임이 섞여 COLMAP 매칭을 망친다.
그래서 **구간(bucket)마다 가장 선명한 한 장**을 고른다 — 균등한 시간 간격(=겹침 유지)을
지키면서 흐린 프레임을 배제하는 가장 싼 방법이다.

선명도 판정은 모바일과 같은 라플라시안 분산을 쓴다(`packages/shared/site-capture-guide.ts`).
"""

from __future__ import annotations

from typing import List, Optional, Sequence

# site-scan-3d.ts 미러
MIN_SCAN_FRAMES = 40
MAX_SCAN_FRAMES = 200

# 복원에 실제로 넣을 프레임 수. COLMAP 매칭 시간이 장수에 비례해 늘어난다.
TARGET_SCAN_FRAMES = 150

# 추출 fps. **선별할 여유분을 만들려면 목표 장수보다 넉넉히 뽑아야 한다.**
# 목표와 같은 수만 뽑으면 구간마다 후보가 1장뿐이라 흐림 필터가 무력해진다
# (30초×3fps=90장 → 상한 이하라 전부 통과 = 흔들린 프레임도 그대로 COLMAP 으로 간다).
SCAN_EXTRACT_FPS = 8

# 구간당 후보가 이 배수 미만이면 흐림 선별 효과가 약하다 — 경고 대상.
# 실측(선별 후 선명 프레임 비율): 1.1배 36% · 1.6배 53% · 2.4배 80% · 3.2배 100%.
# 무작위가 33% 이므로 1.6배까지는 개선이 미미하다. 무릎점인 2.4배를 기준으로 잡는다.
MIN_SELECTION_SURPLUS = 2.4


def select_frame_indices(total_frames: int, target: int = MAX_SCAN_FRAMES) -> List[int]:
    """전체 프레임에서 균등 간격으로 target 장을 고른다.

    프레임이 target 보다 적으면 전부 쓴다(버릴 여유가 없다).
    간격이 벌어지면 인접 사진의 겹침이 줄어 복원이 깨지므로, 균등 간격을 반드시 지킨다.
    """
    if total_frames <= 0 or target <= 0:
        return []
    if total_frames <= target:
        return list(range(total_frames))
    step = total_frames / target
    return [min(total_frames - 1, int(i * step)) for i in range(target)]


def sharpness_of(gray: Sequence[float], width: int, height: int) -> float:
    """라플라시안 분산(값이 클수록 선명). shared 의 computeSharpness 와 동일 규칙."""
    if width < 3 or height < 3:
        return 0.0
    total = 0.0
    total_sq = 0.0
    n = 0
    for y in range(1, height - 1):
        row = y * width
        for x in range(1, width - 1):
            c = row + x
            lap = (
                gray[c - width] + gray[c + width] + gray[c - 1] + gray[c + 1] - 4 * gray[c]
            )
            total += lap
            total_sq += lap * lap
            n += 1
    if n == 0:
        return 0.0
    mean = total / n
    return total_sq / n - mean * mean


def pick_sharpest_per_bucket(
    sharpness: Sequence[float], target: int = MAX_SCAN_FRAMES
) -> List[int]:
    """프레임을 target 개 구간으로 나누고 각 구간에서 가장 선명한 프레임 인덱스를 고른다.

    균등 간격(=겹침 유지)은 구간이 보장하고, 흔들린 프레임 배제는 구간 내 최댓값이 한다.
    """
    n = len(sharpness)
    if n == 0 or target <= 0:
        return []
    if n <= target:
        return list(range(n))

    picked: List[int] = []
    step = n / target
    for i in range(target):
        start = int(i * step)
        end = min(n, max(start + 1, int((i + 1) * step)))
        best = start
        for j in range(start, end):
            if sharpness[j] > sharpness[best]:
                best = j
        picked.append(best)
    return picked


def selection_surplus(extracted: int, target: int = TARGET_SCAN_FRAMES) -> float:
    """구간당 후보 수(= 추출 장수 / 목표 장수). 1.0 이면 선별할 여지가 없다."""
    if target <= 0:
        return 0.0
    return extracted / target


def surplus_warning(extracted: int, target: int = TARGET_SCAN_FRAMES) -> Optional[str]:
    """흐림 선별이 실효가 있는지. 여유가 부족하면 사유를 반환한다."""
    if selection_surplus(extracted, target) < MIN_SELECTION_SURPLUS:
        return (
            f"추출 {extracted}장으로는 흐린 프레임을 걸러낼 여유가 없습니다"
            f"(목표 {target}장). 더 길게 촬영하거나 추출 fps 를 올리세요."
        )
    return None


def ffmpeg_extract_command(
    video_path: str, out_dir: str, fps: int = SCAN_EXTRACT_FPS
) -> List[str]:
    """영상에서 프레임을 뽑는 ffmpeg 명령. 실행은 호출부가 한다(테스트 가능하게 분리)."""
    return [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-i", video_path,
        "-vf", f"fps={fps}",
        "-q:v", "2",
        f"{out_dir}/frame_%05d.jpg",
    ]


def enough_frames(count: int) -> Optional[str]:
    """복원에 충분한 장수인지. 부족하면 사용자에게 보여줄 사유를 반환한다."""
    if count < MIN_SCAN_FRAMES:
        return (
            f"복원에는 최소 {MIN_SCAN_FRAMES}장이 필요한데 {count}장뿐입니다. "
            "30~60초 동안 천천히 한 바퀴 돌면서 다시 촬영해 주세요."
        )
    return None
