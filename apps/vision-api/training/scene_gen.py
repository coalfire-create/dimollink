#!/usr/bin/env python3
"""다중 자재 합성 씬 생성 (단일→다중 자재 도메인 갭 해소).

MINC/콘크리트/슬레이트 단일 자재 패치를 한 캔버스에 2~4개 붙여 '여러 자재가 섞인 현장' 이미지를
만든다. 라벨은 붙인 자재 코드 집합. 앱의 실제 입력(멀티 자재 씬) 형태를 근사한다.
"""
import argparse, json, os, glob, random
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("--minc-root", default="/home/thomas/minc-2500")
ap.add_argument("--concrete-dir", default="/home/thomas/concrete/train")
ap.add_argument("--slate-jsonl", default="data/train_recognition.jsonl")  # korea, 슬레이트 필터
ap.add_argument("--out-dir", required=True)      # 합성 이미지 저장
ap.add_argument("--out-jsonl", required=True)
ap.add_argument("--n", type=int, default=2000)
ap.add_argument("--canvas", type=int, default=512)
ap.add_argument("--seed", type=int, default=0)
a = ap.parse_args()
random.seed(a.seed)
os.makedirs(a.out_dir, exist_ok=True)

MINC_MAP = {"brick": "BRICK_MASONRY", "stone": "BRICK_MASONRY", "wood": "WOOD",
            "metal": "METAL", "glass": "GLASS", "tile": "SANITARY_TILE",
            "ceramic": "SANITARY_TILE", "plastic": "WASTE_SYNTHETIC_RESIN"}

# code -> [이미지 경로들]
pool: dict = {}
for cat, code in MINC_MAP.items():
    imgs = glob.glob(os.path.join(a.minc_root, "images", cat, "*.jpg"))
    pool.setdefault(code, []).extend(imgs)
pool["REINFORCED_CONCRETE"] = glob.glob(os.path.join(a.concrete_dir, "*", "*.jpg"))
# 슬레이트(korea 항공 슬레이트 이미지)
slate = [json.loads(l)["image"] for l in open(a.slate_jsonl) if l.strip()
         and "ROOFING_SLATE" in json.loads(l)["materials"]]
pool["ROOFING_SLATE"] = slate
pool = {k: v for k, v in pool.items() if v}
codes = list(pool)
print("자재 풀:", {k: len(v) for k, v in pool.items()}, flush=True)


def make_one(idx: int):
    k = random.randint(2, 4)
    chosen = random.sample(codes, min(k, len(codes)))
    canvas = Image.new("RGB", (a.canvas, a.canvas), (40, 40, 40))
    # 캔버스를 격자 셀로 나눠 각 자재를 한 셀 이상에 배치(겹침 최소)
    cols = 2 if k <= 2 else 2
    rows = (k + cols - 1) // cols
    cw, ch = a.canvas // cols, a.canvas // rows
    slots = [(c * cw, r * ch) for r in range(rows) for c in range(cols)]
    random.shuffle(slots)
    for i, code in enumerate(chosen):
        try:
            patch = Image.open(random.choice(pool[code])).convert("RGB")
        except Exception:
            continue
        # 셀보다 약간 크게(랜덤) 리사이즈 후 셀 위치에 배치
        pw = int(cw * random.uniform(0.9, 1.2)); ph = int(ch * random.uniform(0.9, 1.2))
        patch = patch.resize((max(pw, 8), max(ph, 8)))
        x, y = slots[i % len(slots)]
        canvas.paste(patch, (x + random.randint(-8, 8), y + random.randint(-8, 8)))
    path = os.path.join(a.out_dir, f"scene_{idx:05d}.jpg")
    canvas.save(path, quality=85)
    return {"image": path, "materials": sorted(set(chosen)), "hazards":
            [{"type": "ASBESTOS_SUSPECT", "material_code": "ROOFING_SLATE"}]
            if "ROOFING_SLATE" in chosen else [],
            "source": "scene_synth", "task": "recognition"}


with open(a.out_jsonl, "w", encoding="utf-8") as w:
    for i in range(a.n):
        w.write(json.dumps(make_one(i), ensure_ascii=False) + "\n")
print(f"합성 씬 {a.n}개 → {a.out_jsonl}", flush=True)
