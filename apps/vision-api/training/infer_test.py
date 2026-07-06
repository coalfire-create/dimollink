#!/usr/bin/env python3
"""학습된 LoRA 어댑터 추론 검증. eval 셋 일부로 자재 예측 + 석면 탐지 확인."""
import argparse, json, re, torch
from PIL import Image
from peft import PeftModel
from transformers import AutoProcessor, BitsAndBytesConfig
try:
    from transformers import AutoModelForImageTextToText as VLM
except ImportError:
    from transformers import AutoModelForVision2Seq as VLM

ap = argparse.ArgumentParser()
ap.add_argument('--base', default='Qwen/Qwen3-VL-8B-Instruct')
ap.add_argument('--adapter', default='training/adapters/recognition-v1')
ap.add_argument('--data', default='data/eval_recognition.jsonl')
ap.add_argument('--n', type=int, default=40)
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

rows = [json.loads(l) for l in open(a.data) if l.strip()][:a.n]

def predict(img_path):
    msgs = [{"role": "system", "content": SYS},
            {"role": "user", "content": [{"type": "image"},
                                         {"type": "text", "text": "이 현장의 자재는?"}]}]
    text = proc.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    img = Image.open(img_path).convert("RGB")
    enc = proc(text=[text], images=[img], return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(**enc, max_new_tokens=64, do_sample=False)
    gen = proc.batch_decode(out[:, enc['input_ids'].shape[1]:], skip_special_tokens=True)[0]
    m = re.search(r'\{.*\}', gen, re.S)
    try:
        return set(json.loads(m.group(0)).get('materials', [])), gen
    except Exception:
        return set(), gen

# 석면(ROOFING_SLATE) 재현율 중심 평가
slate_tp = slate_fn = 0
mat_tp = mat_fp = mat_fn = 0
fmt_ok = 0
for i, r in enumerate(rows):
    gt = set(r['materials'])
    pred, raw = predict(r['image'])
    if pred:
        fmt_ok += 1
    if 'ROOFING_SLATE' in gt:
        slate_tp += 'ROOFING_SLATE' in pred
        slate_fn += 'ROOFING_SLATE' not in pred
    mat_tp += len(gt & pred); mat_fp += len(pred - gt); mat_fn += len(gt - pred)
    if i < 8:
        print(f"[{i}] gt={sorted(gt)} pred={sorted(pred)}")

slate_total = slate_tp + slate_fn
print("\n=== 검증 결과 (eval", len(rows), "장) ===")
print(f"JSON 포맷 성공률: {fmt_ok}/{len(rows)}")
print(f"석면 슬레이트 재현율: {slate_tp}/{slate_total} = {slate_tp/max(slate_total,1):.2f}  (목표 0.95)")
prec = mat_tp/max(mat_tp+mat_fp,1); rec = mat_tp/max(mat_tp+mat_fn,1)
print(f"자재 전체 precision {prec:.2f} / recall {rec:.2f}")
