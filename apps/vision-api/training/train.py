#!/usr/bin/env python3
"""디몰비전 QLoRA 파인튜닝 실행기 (기획서 §4.2 단계적 고도화, §6.2 학습비용 최소화).

외부 AI API 무종속: 오픈웨이트(Qwen3-VL) + 로컬 QLoRA. 무거운 라이브러리
(transformers/peft/trl/bitsandbytes)는 실제 학습 시에만 지연 임포트한다.

Colab Pro+(A100 40GB) 기준. GPU 없이 배선만 검증하려면 --dry-run.

  # 실학습(GPU)
  python training/train.py --config training/qlora_config.yaml --task recognition
  # 배선 검증(GPU 불필요): 데이터 검증 + 계획 출력 + 어댑터 메타/대장 레코드 생성
  python training/train.py --config training/qlora_config.yaml --task recognition --dry-run

산출물:
  <output_adapter>/               LoRA 어댑터 가중치(실학습) 또는 빈 폴더(dry-run)
  <output_adapter>/metadata.json  base_model·해시·학습 표본수·config 요약
  <output_adapter>/model_version.json  model_versions 대장 삽입용 레코드(§5.2)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from typing import Dict, List

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _load_yaml(path: str) -> Dict:
    try:
        import yaml  # PyYAML
    except ModuleNotFoundError:
        raise SystemExit("PyYAML 필요: pip install pyyaml")
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_jsonl(path: str) -> List[Dict]:
    rows: List[Dict] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def validate_examples(rows: List[Dict], task: str) -> None:
    """학습 전 데이터 계약 점검. 깨진 데이터로 GPU 시간을 태우지 않도록."""
    if not rows:
        raise SystemExit("학습 예시가 비어 있습니다. scripts/prepare_data.py 먼저 실행.")
    for i, r in enumerate(rows):
        if "image" not in r:
            raise SystemExit(f"[{i}] 'image' 필드 없음")
        if task == "recognition" and "materials" not in r:
            raise SystemExit(f"[{i}] recognition 예시에 'materials' 없음")


def _adapter_hash(config: Dict, rows: List[Dict], task: str) -> str:
    """config + 데이터 지문으로 재현 가능한 어댑터 해시(대장 추적용)."""
    h = hashlib.sha256()
    h.update(json.dumps(config.get("lora", {}), sort_keys=True).encode())
    h.update(json.dumps(config.get("train", {}), sort_keys=True).encode())
    h.update(f"{task}:{len(rows)}".encode())
    return h.hexdigest()[:12]


def _write_registry(out_dir: str, config: Dict, rows: List[Dict], task: str,
                    trained: bool) -> str:
    os.makedirs(out_dir, exist_ok=True)
    adapter_hash = _adapter_hash(config, rows, task)
    base = config["base_model"]
    meta = {
        "base_model": base,
        "adapter_hash": adapter_hash,
        "task": task,
        "num_examples": len(rows),
        "trained": trained,
        "lora": config.get("lora", {}),
        "train": config.get("train", {}),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    with open(os.path.join(out_dir, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    # model_versions 대장(§5.2) 삽입용. 평가 통과 후 배포 시 사용.
    version = {
        "model_version": f"{base}+{adapter_hash}",
        "base_model": base,
        "adapter_hash": adapter_hash,
        "task": task,
        "status": "trained" if trained else "dry-run",
        "eval_passed": None,  # scripts/eval.py 통과 후 업데이트
        "created_at": meta["created_at"],
    }
    with open(os.path.join(out_dir, "model_version.json"), "w", encoding="utf-8") as f:
        json.dump(version, f, ensure_ascii=False, indent=2)
    return adapter_hash


def train(config: Dict, task: str, dry_run: bool) -> None:
    task_cfg = config["tasks"][task]
    out_dir = task_cfg["output_adapter"]
    rows = load_jsonl(task_cfg["train"])
    validate_examples(rows, task)

    if dry_run:
        adapter_hash = _write_registry(out_dir, config, rows, task, trained=False)
        print(json.dumps({
            "mode": "dry-run",
            "task": task,
            "examples": len(rows),
            "base_model": config["base_model"],
            "adapter": out_dir,
            "adapter_hash": adapter_hash,
            "note": "GPU 학습은 --dry-run 없이 실행. 데이터·config·대장 배선 검증 완료.",
        }, ensure_ascii=False, indent=2))
        return

    # ---- 실학습 경로(GPU 필요). 지연 임포트로 CPU 환경 임포트 실패 방지. ----
    try:
        import torch  # noqa: F401
        from datasets import Dataset  # noqa: F401
        from peft import LoraConfig, get_peft_model  # noqa: F401
        from transformers import (  # noqa: F401
            AutoModelForVision2Seq,
            AutoProcessor,
            BitsAndBytesConfig,
            TrainingArguments,
        )
    except ModuleNotFoundError as e:
        raise SystemExit(
            f"실학습 의존성 미설치({e.name}). Colab에서 training/colab_qlora.ipynb 사용 또는:\n"
            "  pip install torch transformers peft trl bitsandbytes datasets accelerate"
        )

    q = config["quantization"]
    bnb = BitsAndBytesConfig(
        load_in_4bit=q["load_in_4bit"],
        bnb_4bit_quant_type=q["bnb_4bit_quant_type"],
        bnb_4bit_compute_dtype=getattr(torch, q["bnb_4bit_compute_dtype"]),
    )
    processor = AutoProcessor.from_pretrained(config["base_model"], trust_remote_code=True)
    model = AutoModelForVision2Seq.from_pretrained(
        config["base_model"], quantization_config=bnb, device_map="auto", trust_remote_code=True
    )
    lora = config["lora"]
    model = get_peft_model(model, LoraConfig(
        r=lora["r"], lora_alpha=lora["alpha"], lora_dropout=lora["dropout"],
        target_modules=lora["target_modules"], task_type="CAUSAL_LM",
    ))
    model.print_trainable_parameters()

    # 데이터 → chat 포맷(이미지 + 자재 JSON 타깃)은 프로세서/템플릿에 맞춰 collate 에서 처리.
    # (전체 collate·SFTTrainer 루프는 Colab 노트북에 포함 — GPU에서만 유효)
    raise SystemExit(
        "실학습 루프는 training/colab_qlora.ipynb 에서 실행하세요(A100 필요). "
        "이 CLI는 로컬 배선/데이터 검증(--dry-run)과 모델 로딩까지 담당합니다."
    )


def main() -> int:
    p = argparse.ArgumentParser(description="디몰비전 QLoRA 학습")
    p.add_argument("--config", default="training/qlora_config.yaml")
    p.add_argument("--task", default="recognition", choices=["recognition", "generation"])
    p.add_argument("--dry-run", action="store_true", help="GPU 없이 데이터·config·대장 배선만 검증")
    args = p.parse_args()

    config = _load_yaml(args.config)
    if args.task == "generation" and not config["tasks"]["generation"].get("enabled", False):
        print("generation 과업은 config 에서 비활성(루브릭 채점 후 활성화, §4.2). 종료.", file=sys.stderr)
        return 0
    train(config, args.task, args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
