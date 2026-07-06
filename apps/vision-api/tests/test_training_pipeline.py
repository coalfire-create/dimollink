"""공개데이터→학습 파이프라인 검증 (기획서 §4.2, §V2/V3).

GPU/실데이터 없이도 데이터→전처리→(dry-run)학습→대장 배선이 도는지 확인한다.
실제 성능(재현율)은 GPU 실학습에서만 나오며 여기서 검증 대상이 아니다.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from training.public_datasets import (
    SELF_COLLECT_REQUIRED,
    coverage_report,
    hazards_for,
    map_class,
)

API_DIR = Path(__file__).resolve().parent.parent


def test_class_map_normalizes_public_classes_to_taxonomy():
    assert map_class("codd", "Bricks") == "BRICK_MASONRY"
    assert map_class("codd", "plaster boards") == "GYPSUM_BOARD"
    assert map_class("aihub_industrial", "금속") == "METAL"
    # 매핑 없는 원본 클래스는 None(무시)
    assert map_class("codd", "unknown-thing") is None


def test_asbestos_has_no_public_source_and_is_self_collect():
    # 어떤 공개 데이터셋도 ROOFING_SLATE(석면 의심)를 라벨하지 않는다
    for ds in ("codd", "aihub_industrial", "roboflow_construction"):
        assert "ROOFING_SLATE" not in coverage_report(ds)["covered_codes"]
    assert "ROOFING_SLATE" in SELF_COLLECT_REQUIRED


def test_hazards_flag_asbestos_only():
    assert hazards_for(["BRICK_MASONRY", "WOOD"]) == []
    hz = hazards_for(["ROOFING_SLATE"])
    assert hz and hz[0]["type"] == "ASBESTOS_SUSPECT"


def _write_synthetic_codd(root: Path) -> Path:
    """작은 CODD 형태(COCO) 합성셋 생성. 이미지 파일은 존재만 하면 됨."""
    images = root / "images"
    images.mkdir(parents=True)
    for name in ("a.jpg", "b.jpg", "c.jpg"):
        (images / name).write_bytes(b"\xff\xd8\xff")  # jpeg 헤더 스텁
    coco = {
        "images": [
            {"id": 1, "file_name": "a.jpg"},
            {"id": 2, "file_name": "b.jpg"},
            {"id": 3, "file_name": "c.jpg"},  # 주석 없음 = 배경
        ],
        "categories": [
            {"id": 10, "name": "bricks"},
            {"id": 11, "name": "concrete"},
            {"id": 12, "name": "wood"},
        ],
        "annotations": [
            {"id": 1, "image_id": 1, "category_id": 10},
            {"id": 2, "image_id": 1, "category_id": 12},
            {"id": 3, "image_id": 2, "category_id": 11},
        ],
    }
    ann = root / "annotations.json"
    ann.write_text(json.dumps(coco), encoding="utf-8")
    return ann


def test_prepare_data_coco_to_jsonl(tmp_path):
    root = tmp_path / "CODD"
    ann = _write_synthetic_codd(root)
    out = tmp_path / "train_recognition.jsonl"

    r = subprocess.run(
        [sys.executable, "scripts/prepare_data.py", "--format", "coco", "--dataset", "codd",
         "--coco", str(ann), "--images", str(root / "images"), "--out", str(out)],
        cwd=API_DIR, capture_output=True, text=True,
    )
    assert r.returncode == 0, r.stderr

    rows = [json.loads(l) for l in out.read_text(encoding="utf-8").splitlines() if l.strip()]
    by_img = {Path(x["image"]).name: x for x in rows}
    assert set(by_img["a.jpg"]["materials"]) == {"BRICK_MASONRY", "WOOD"}
    assert by_img["b.jpg"]["materials"] == ["PLAIN_CONCRETE"]
    assert by_img["c.jpg"]["materials"] == []  # 배경 이미지도 유지
    assert all(x["task"] == "recognition" and x["source"] == "codd" for x in rows)


def test_train_dry_run_wires_registry(tmp_path):
    # prepare_data 산출물을 config 가 가리키는 경로에 두고 dry-run 학습
    data_dir = API_DIR / "data"
    data_dir.mkdir(exist_ok=True)
    train_jsonl = data_dir / "train_recognition.jsonl"
    created = False
    if not train_jsonl.exists():
        train_jsonl.write_text(
            json.dumps({"image": "x/a.jpg", "materials": ["BRICK_MASONRY"],
                        "hazards": [], "source": "codd", "task": "recognition"},
                       ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        created = True
    try:
        r = subprocess.run(
            [sys.executable, "training/train.py", "--config", "training/qlora_config.yaml",
             "--task", "recognition", "--dry-run"],
            cwd=API_DIR, capture_output=True, text=True,
        )
        assert r.returncode == 0, r.stderr
        out = json.loads(r.stdout)
        assert out["mode"] == "dry-run"
        assert out["examples"] >= 1
        # 대장 레코드가 생성되었는지
        adapter = API_DIR / "training" / "adapters" / "recognition-v1"
        version = json.loads((adapter / "model_version.json").read_text(encoding="utf-8"))
        assert version["model_version"].startswith("Qwen/Qwen3-VL-8B-Instruct+")
        assert version["status"] == "dry-run"
    finally:
        if created:
            train_jsonl.unlink()
