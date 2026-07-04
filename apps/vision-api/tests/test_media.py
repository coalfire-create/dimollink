"""현장 사진 개인정보 제거 테스트 (기획서 §7.2)."""

import io

from PIL import Image, ImageDraw

from app.media import NoOpDetector, blur_regions, sanitize_image, strip_exif


def _img_with_exif() -> bytes:
    im = Image.new("RGB", (40, 40), "white")
    ImageDraw.Draw(im).rectangle([10, 10, 30, 30], fill="black")
    exif = Image.Exif()
    exif[0x9286] = "촬영메모"  # UserComment
    exif[0x0132] = "2024:01:01 12:00:00"  # DateTime
    buf = io.BytesIO()
    im.save(buf, "JPEG", exif=exif)
    return buf.getvalue()


def test_original_has_exif():
    with Image.open(io.BytesIO(_img_with_exif())) as im:
        assert len(dict(im.getexif())) > 0


def test_sanitize_strips_exif():
    result = sanitize_image(_img_with_exif())
    assert result.exif_stripped
    with Image.open(io.BytesIO(result.data)) as im:
        assert len(dict(im.getexif())) == 0


def test_strip_exif_preserves_size_mode():
    with Image.open(io.BytesIO(_img_with_exif())) as im:
        im = im.convert("RGB")
        clean = strip_exif(im)
        assert clean.size == im.size and clean.mode == im.mode


def test_blur_changes_region_pixels():
    im = Image.new("RGB", (40, 40), "white")
    ImageDraw.Draw(im).rectangle([10, 10, 30, 30], fill="black")
    blurred = blur_regions(im, [(0, 0, 40, 40)], radius=8)
    # 경계 부근 픽셀이 블러로 달라진다
    assert im.getpixel((10, 20)) != blurred.getpixel((10, 20))


def test_noop_detector_no_blur():
    result = sanitize_image(_img_with_exif(), NoOpDetector())
    assert result.exif_stripped
    assert result.pii_blurred is False
    assert result.regions_blurred == 0


def test_detector_sets_blur_flag():
    class BoxDetector:
        def detect(self, image):
            return [(5, 5, 20, 20)]

    result = sanitize_image(_img_with_exif(), BoxDetector())
    assert result.pii_blurred is True
    assert result.regions_blurred == 1


def test_detector_failure_still_strips_exif():
    class BrokenDetector:
        def detect(self, image):
            raise RuntimeError("모델 오류")

    result = sanitize_image(_img_with_exif(), BrokenDetector())
    assert result.exif_stripped is True
    assert result.pii_blurred is False
    assert any("탐지 실패" in w for w in result.warnings)
