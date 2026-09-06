#!/usr/bin/env python3
"""MINC-2500(지상 자재) → 디몰비전 recognition JSONL + 우리 12종 매핑.

MINC 카테고리 중 철거자재에 대응하는 것만 사용(지상 근접 자재 = 앱 도메인).
Korea 슬레이트(석면)와 결합해 지상 자재인식 + 석면 탐지 모델을 만든다.
"""
import argparse, json, os, random, collections

# MINC 카테고리 → 디몰비전 12종. 대응 없는 카테고리(carpet/foliage/sky 등)는 제외.
#
# ⚠️ 메울 수 없는 공백: GYPSUM_BOARD(석고보드) · WATERPROOF_INSULATION(방수/단열재).
# MINC-2500 에는 대응 카테고리가 없다("painted"/"wallpaper" 는 도장 콘크리트일 수도
# 석고보드일 수도 있어 약라벨로 쓰면 정밀도를 깎는다). 둘 다 실내 철거 빈출 자재이므로
# 실현장 촬영·라벨링으로만 확보된다 — 억지 매핑을 추가하지 말 것.
# 평가에서는 정답 표본 0건으로 `unevaluated_classes` 에 드러난다(app/eval/metrics.py).
MINC_MAP = {
    "brick": "BRICK_MASONRY",
    "stone": "BRICK_MASONRY",
    "wood": "WOOD",
    "metal": "METAL",
    "glass": "GLASS",
    "tile": "SANITARY_TILE",
    "ceramic": "SANITARY_TILE",
    "plastic": "WASTE_SYNTHETIC_RESIN",
}

ap = argparse.ArgumentParser()
ap.add_argument("--root", default="minc-2500")           # 압축 해제 루트
ap.add_argument("--per-class", type=int, default=300)     # train 클래스당 상한
ap.add_argument("--test-per-class", type=int, default=50)
ap.add_argument("--out-train", default="minc_train.jsonl")
ap.add_argument("--out-test", default="minc_test.jsonl")
a = ap.parse_args()
random.seed(42)


def load_split(name):
    """labels/<name>1.txt → [(rel_path, category)] (매핑 대상만)."""
    path = os.path.join(a.root, "labels", f"{name}1.txt")
    rows = []
    with open(path) as f:
        for line in f:
            rel = line.strip()
            if not rel:
                continue
            parts = rel.split("/")
            cat = parts[1] if len(parts) > 1 else None
            if cat in MINC_MAP:
                rows.append((rel, cat))
    return rows


def write(rows, cap, out):
    by_cat = collections.defaultdict(list)
    for rel, cat in rows:
        by_cat[cat].append(rel)
    n = 0
    with open(out, "w", encoding="utf-8") as w:
        for cat, rels in by_cat.items():
            random.shuffle(rels)
            for rel in rels[:cap]:
                img = os.path.join(a.root, rel)
                w.write(json.dumps({
                    "image": img, "materials": [MINC_MAP[cat]],
                    "hazards": [], "source": "minc", "task": "recognition",
                }, ensure_ascii=False) + "\n")
                n += 1
    dist = {c: min(len(v), cap) for c, v in by_cat.items()}
    print(f"{out}: {n}건 | 클래스분포(코드): ", dict(collections.Counter(MINC_MAP[c] for c in dist for _ in range(dist[c]))))
    return n


write(load_split("train"), a.per_class, a.out_train)
write(load_split("test"), a.test_per_class, a.out_test)
