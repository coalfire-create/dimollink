#!/usr/bin/env python3
"""견고한 추론 검증: 생성마다 타임아웃(멈추면 skip). 지상 자재 정확도 측정."""
import argparse, json, re, signal, sys, collections, torch
from PIL import Image
from peft import PeftModel
from transformers import AutoProcessor, BitsAndBytesConfig
try:
    from transformers import AutoModelForImageTextToText as VLM
except ImportError:
    from transformers import AutoModelForVision2Seq as VLM

ap = argparse.ArgumentParser()
ap.add_argument('--base', default='Qwen/Qwen3-VL-8B-Instruct')
ap.add_argument('--adapter', required=True)
ap.add_argument('--data', required=True)
ap.add_argument('--n', type=int, default=60)
ap.add_argument('--timeout', type=int, default=40)
a = ap.parse_args()

SYS = ('너는 철거현장 자재 인식기다. 이미지의 해체 자재를 12종 코드로만 답한다. '
       'JSON {"materials":[코드,...]}. 석면 의심(ROOFING_SLATE)은 "확정"이 아닌 "의심"으로만.')

bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4',
                         bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True)
proc = AutoProcessor.from_pretrained(a.base, trust_remote_code=True)
model = VLM.from_pretrained(a.base, quantization_config=bnb, device_map='auto',
                            trust_remote_code=True, dtype=torch.bfloat16)
model = PeftModel.from_pretrained(model, a.adapter)
model.eval()
# 학습 때 use_cache=False 로 저장됨 → 추론에선 KV캐시 켜야 빠름(hang 방지)
model.config.use_cache = True
try:
    model.generation_config.use_cache = True
except Exception:
    pass
print("모델+어댑터 로드 완료 (use_cache=True)", flush=True)


class TimeoutErr(Exception):
    pass


def _alarm(signum, frame):
    raise TimeoutErr()


signal.signal(signal.SIGALRM, _alarm)


def predict(img_path):
    msgs = [{"role": "system", "content": SYS},
            {"role": "user", "content": [{"type": "image"},
                                         {"type": "text", "text": "이 현장의 자재는?"}]}]
    text = proc.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    img = Image.open(img_path).convert("RGB")
    enc = proc(text=[text], images=[img], return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(**enc, max_new_tokens=48, do_sample=False)
    gen = proc.batch_decode(out[:, enc['input_ids'].shape[1]:], skip_special_tokens=True)[0]
    m = re.search(r'\{.*\}', gen, re.S)
    return set(json.loads(m.group(0)).get('materials', [])) if m else set()


rows = [json.loads(l) for l in open(a.data) if l.strip()][:a.n]
mat_tp = mat_fp = mat_fn = fmt_ok = 0
slate_tp = slate_fn = 0
per_class = collections.defaultdict(lambda: [0, 0])  # code -> [correct, total] (single-label acc)
skipped = 0
for i, r in enumerate(rows):
    gt = set(r['materials'])
    try:
        signal.alarm(a.timeout)
        pred = predict(r['image'])
        signal.alarm(0)
    except (TimeoutErr, Exception) as e:
        signal.alarm(0)
        skipped += 1
        print(f"[{i}] SKIP({type(e).__name__})", flush=True)
        continue
    if pred:
        fmt_ok += 1
    if 'ROOFING_SLATE' in gt:
        slate_tp += 'ROOFING_SLATE' in pred; slate_fn += 'ROOFING_SLATE' not in pred
    mat_tp += len(gt & pred); mat_fp += len(pred - gt); mat_fn += len(gt - pred)
    if len(gt) == 1:  # 단일자재(MINC): 정답 코드가 예측에 포함되면 correct
        c = next(iter(gt)); per_class[c][1] += 1; per_class[c][0] += c in pred
    print(f"[{i}] gt={sorted(gt)} pred={sorted(pred)}", flush=True)

n_done = len(rows) - skipped
st = slate_tp + slate_fn
print("\n=== 지상자재 검증 결과 ===", flush=True)
print(f"완료 {n_done}/{len(rows)} (skip {skipped}) | JSON포맷 {fmt_ok}/{n_done}", flush=True)
print(f"자재 precision {mat_tp/max(mat_tp+mat_fp,1):.2f} / recall {mat_tp/max(mat_tp+mat_fn,1):.2f}", flush=True)
if st:
    print(f"석면 슬레이트 재현율: {slate_tp}/{st} = {slate_tp/st:.2f}", flush=True)
print("클래스별 정확도(단일자재):", {c: f"{v[0]}/{v[1]}" for c, v in sorted(per_class.items())}, flush=True)
