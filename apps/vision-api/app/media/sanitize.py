"""현장 사진 개인정보 제거 (기획서 §4.3, §7.2).

- EXIF(GPS 좌표 포함) 제거: 업로드 파이프라인 기본 수행. 원본 좌표는 동의 시에만 별도 보관.
- 번호판·인물 자동 블러: 학습 데이터 편입 전 수행.

탐지기(RegionDetector)는 교체 가능하다:
- NoOpDetector: 탐지 없음(로컬/CI, EXIF 제거만).
- (운영) 얼굴/번호판 탐지 모델은 media extra 로 붙인다 — 외부 API 무종속(로컬 모델).
블러 자체는 좌표만 주면 순수 연산이라 검증 가능하다.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import List, Tuple

from PIL import Image, ImageFilter
from typing_extensions import Protocol, runtime_checkable

# (left, top, right, bottom) 픽셀 박스
Box = Tuple[int, int, int, int]


@runtime_checkable
class RegionDetector(Protocol):
    def detect(self, image: Image.Image) -> List[Box]: ...


class NoOpDetector:
    def detect(self, image: Image.Image) -> List[Box]:
        return []


@dataclass
class SanitizeResult:
    data: bytes
    content_type: str
    exif_stripped: bool
    pii_blurred: bool
    regions_blurred: int = 0
    warnings: List[str] = field(default_factory=list)


def strip_exif(image: Image.Image) -> Image.Image:
    """픽셀 데이터만 복사해 EXIF/메타데이터를 제거한 새 이미지를 만든다."""
    clean = Image.new(image.mode, image.size)
    clean.putdata(list(image.getdata()))
    return clean


def blur_regions(image: Image.Image, boxes: List[Box], radius: int = 16) -> Image.Image:
    """지정 박스를 가우시안 블러 처리(원본 미변경, 새 이미지 반환)."""
    out = image.copy()
    for box in boxes:
        left, top, right, bottom = box
        left, top = max(0, left), max(0, top)
        right, bottom = min(image.width, right), min(image.height, bottom)
        if right <= left or bottom <= top:
            continue
        region = out.crop((left, top, right, bottom)).filter(ImageFilter.GaussianBlur(radius))
        out.paste(region, (left, top))
    return out


def sanitize_image(
    data: bytes,
    detector: RegionDetector = NoOpDetector(),
    *,
    output_format: str = "JPEG",
) -> SanitizeResult:
    """이미지 바이트 → EXIF 제거 + (탐지된) PII 영역 블러 → 정제 바이트."""
    warnings: List[str] = []
    with Image.open(io.BytesIO(data)) as im:
        im = im.convert("RGB")
        boxes: List[Box] = []
        try:
            boxes = detector.detect(im)
        except Exception as exc:  # noqa: BLE001 — 탐지 실패해도 EXIF 제거는 보장
            warnings.append(f"PII 탐지 실패(블러 생략): {exc}")
        blurred = blur_regions(im, boxes) if boxes else im
        clean = strip_exif(blurred)

        buf = io.BytesIO()
        clean.save(buf, format=output_format)
        content_type = "image/jpeg" if output_format.upper() in ("JPEG", "JPG") else f"image/{output_format.lower()}"

    return SanitizeResult(
        data=buf.getvalue(),
        content_type=content_type,
        exif_stripped=True,
        pii_blurred=bool(boxes),
        regions_blurred=len(boxes),
        warnings=warnings,
    )
