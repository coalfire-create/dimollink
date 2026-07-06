#!/usr/bin/env python3
"""공개 데이터셋 → 디몰비전 recognition 학습 JSONL 변환 (기획서 §4.2, §V2/V3).

파인튜닝(training/train.py)이 바로 먹을 수 있는 과업별 JSONL 을 만든다. 원본 클래스는
training/public_datasets.py 의 매핑으로 우리 12종 코드로 정규화한다.

지원 입력 포맷:
  --format coco   COCO object-detection JSON (CODD 등). --coco 와 --images 지정.
  --format folder 클래스별 하위폴더 이미지(Roboflow classification, AI Hub 분류). --images 지정.

출력(JSONL, 한 줄=한 이미지):
  {"image": "<경로>", "materials": ["BRICK_MASONRY", ...],
   "hazards": [...], "source": "codd", "task": "recognition"}

예:
  python scripts/prepare_data.py --format coco --dataset codd \\
      --coco data/CODD/annotations.json --images data/CODD/images \\
      --out data/train_recognition.jsonl
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from typing import Dict, List, Set

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from training.public_datasets import coverage_report, hazards_for, map_class

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".bmp", ".webp")


def _from_coco(dataset: str, coco_path: str, images_dir: str) -> Dict[str, Set[str]]:
    """COCO JSON → {이미지경로: {코드,...}}. 매핑 안 되는 카테고리는 무시."""
    with open(coco_path, encoding="utf-8") as f:
        coco = json.load(f)
    cat_name = {c["id"]: c["name"] for c in coco.get("categories", [])}
    img_file = {im["id"]: im["file_name"] for im in coco.get("images", [])}
    per_image: Dict[str, Set[str]] = defaultdict(set)
    # 라벨이 아예 없는 이미지도(=배경) 학습에 넣을 수 있게 우선 등록
    for im in coco.get("images", []):
        per_image[os.path.join(images_dir, im["file_name"])]  # touch → 빈 set
    for ann in coco.get("annotations", []):
        raw = cat_name.get(ann["category_id"])
        if raw is None:
            continue
        code = map_class(dataset, raw)
        if code is None:
            continue
        path = os.path.join(images_dir, img_file[ann["image_id"]])
        per_image[path].add(code)
    return per_image


def _from_folder(dataset: str, images_dir: str) -> Dict[str, Set[str]]:
    """클래스별 하위폴더 → {이미지경로: {코드}}. 폴더명이 원본 클래스."""
    per_image: Dict[str, Set[str]] = defaultdict(set)
    for entry in sorted(os.listdir(images_dir)):
        cls_dir = os.path.join(images_dir, entry)
        if not os.path.isdir(cls_dir):
            continue
        code = map_class(dataset, entry)
        for fn in sorted(os.listdir(cls_dir)):
            if fn.lower().endswith(IMAGE_EXTS):
                path = os.path.join(cls_dir, fn)
                if code is not None:
                    per_image[path].add(code)
                else:
                    per_image[path]  # 미매핑 클래스: 이미지는 두되 라벨 없음
    return per_image


def build_examples(per_image: Dict[str, Set[str]], source: str) -> List[Dict]:
    examples: List[Dict] = []
    for path in sorted(per_image):
        codes = sorted(per_image[path])
        examples.append(
            {
                "image": path,
                "materials": codes,
                "hazards": hazards_for(codes),
                "source": source,
                "task": "recognition",
            }
        )
    return examples


def main() -> int:
    p = argparse.ArgumentParser(description="공개 데이터 → 디몰비전 학습 JSONL")
    p.add_argument("--format", required=True, choices=["coco", "folder"])
    p.add_argument("--dataset", required=True, help="public_datasets.py 의 데이터셋 키(codd 등)")
    p.add_argument("--coco", help="COCO 주석 JSON 경로(--format coco)")
    p.add_argument("--images", required=True, help="이미지 루트 디렉토리")
    p.add_argument("--out", required=True, help="출력 JSONL 경로")
    p.add_argument("--min-materials", type=int, default=0,
                   help="이 개수 미만 라벨 이미지는 제외(기본 0=배경 포함)")
    args = p.parse_args()

    if args.format == "coco":
        if not args.coco:
            p.error("--format coco 에는 --coco 가 필요합니다")
        per_image = _from_coco(args.dataset, args.coco, args.images)
    else:
        per_image = _from_folder(args.dataset, args.images)

    examples = build_examples(per_image, args.dataset)
    if args.min_materials > 0:
        examples = [e for e in examples if len(e["materials"]) >= args.min_materials]

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    labeled = sum(1 for e in examples if e["materials"])
    cov = coverage_report(args.dataset)
    print(json.dumps({
        "out": args.out,
        "images": len(examples),
        "labeled_images": labeled,
        "coverage": cov,
    }, ensure_ascii=False, indent=2))
    if cov["missing_codes"]:
        print(f"⚠️  이 데이터로 커버 안 되는 코드: {cov['missing_codes']} "
              f"→ 자체 수집 필요(석면 등).", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
