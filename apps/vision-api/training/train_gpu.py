#!/usr/bin/env python3
"""디몰비전 QLoRA 실학습 (GPU/L4). Qwen3-VL-8B-Instruct 4bit + LoRA."""
import argparse, json, yaml, torch
from PIL import Image
from datasets import Dataset
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import AutoProcessor, BitsAndBytesConfig, TrainingArguments, Trainer
try:
    from transformers import AutoModelForImageTextToText as VLM
except ImportError:
    from transformers import AutoModelForVision2Seq as VLM

ap = argparse.ArgumentParser()
ap.add_argument('--config', default='training/qlora_config.yaml')
ap.add_argument('--data', default='data/train_recognition.jsonl')
ap.add_argument('--epochs', type=float, default=None)
ap.add_argument('--max-steps', type=int, default=-1)
ap.add_argument('--out', default='training/adapters/recognition-v1')
a = ap.parse_args()

cfg = yaml.safe_load(open(a.config))
MODEL = cfg['base_model']
rows = [json.loads(l) for l in open(a.data) if l.strip()]
print(f'[data] {len(rows)} examples | model {MODEL}', flush=True)

SYS = ('너는 철거현장 자재 인식기다. 이미지의 해체 자재를 12종 코드로만 답한다. '
       'JSON {"materials":[코드,...]}. 석면 의심(ROOFING_SLATE)은 "확정"이 아닌 "의심"으로만.')
ds = Dataset.from_list([{"image": r["image"],
                         "answer": json.dumps({"materials": r["materials"]}, ensure_ascii=False)}
                        for r in rows])

q = cfg['quantization']
bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type=q['bnb_4bit_quant_type'],
                         bnb_4bit_compute_dtype=getattr(torch, q['bnb_4bit_compute_dtype']),
                         bnb_4bit_use_double_quant=True)
proc = AutoProcessor.from_pretrained(MODEL, trust_remote_code=True)
model = VLM.from_pretrained(MODEL, quantization_config=bnb, device_map='auto',
                            trust_remote_code=True, dtype=torch.bfloat16)
model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
lc = cfg['lora']
model = get_peft_model(model, LoraConfig(r=lc['r'], lora_alpha=lc['alpha'],
        lora_dropout=lc['dropout'], target_modules=lc['target_modules'], task_type='CAUSAL_LM'))
model.config.use_cache = False
model.print_trainable_parameters()

pad_id = proc.tokenizer.pad_token_id

def collate(batch):
    texts, images = [], []
    for b in batch:
        msgs = [{"role": "system", "content": SYS},
                {"role": "user", "content": [{"type": "image"},
                                             {"type": "text", "text": "이 현장의 자재는?"}]},
                {"role": "assistant", "content": b["answer"]}]
        texts.append(proc.apply_chat_template(msgs, tokenize=False))
        images.append(Image.open(b["image"]).convert("RGB"))
    enc = proc(text=texts, images=images, return_tensors="pt", padding=True)
    labels = enc["input_ids"].clone()
    labels[labels == pad_id] = -100
    enc["labels"] = labels
    return enc

t = cfg['train']
args = TrainingArguments(
    output_dir=a.out, num_train_epochs=(a.epochs or t['epochs']),
    per_device_train_batch_size=1, gradient_accumulation_steps=t['grad_accum'],
    learning_rate=t['lr'], warmup_ratio=t['warmup_ratio'], seed=t['seed'],
    bf16=True, logging_steps=10, save_strategy='steps', save_steps=200,
    save_total_limit=2, max_steps=a.max_steps,
    report_to='none', gradient_checkpointing=True, remove_unused_columns=False,
    gradient_checkpointing_kwargs={'use_reentrant': False}, dataloader_num_workers=4)
trainer = Trainer(model=model, args=args, train_dataset=ds, data_collator=collate)
trainer.train()
model.save_pretrained(a.out)
proc.save_pretrained(a.out)
print('SAVED', a.out, flush=True)
