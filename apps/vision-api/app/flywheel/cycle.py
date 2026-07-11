"""데이터 플라이휠 재학습 루틴 (기획서 §V5). 조각들을 하나의 분기 사이클로 잇는다.

기존에 개별 조각(피드백 편입 `app/feedback/export.py`, 학습 `training/train.py`,
평가 게이트 `scripts/eval.py`, 어댑터 대장 `metadata/model_version.json`)은 있었지만,
이들을 잇는 오케스트레이션 "루틴"이 없었다. 이 모듈이 그 글루다:

  피드백 → 학습 예시 변환 → 기존 학습셋과 병합 → 학습(dry-run 배선 or GPU)
    → 평가 게이트(§V3 재현율) → 통과 시에만 어댑터 승격(model_version 대장 갱신)

train.py 가 대장에 남긴 `eval_passed: None  # scripts/eval.py 통과 후 업데이트` 자리를
여기서 채운다. 게이트 미달이면 승격하지 않고 이전 어댑터를 유지(롤백 의미론).

순수 오케스트레이션이라 GPU 없이 배선 검증 가능(--dry-run). 실학습만 GPU 필요.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.eval import run_evalset
from app.feedback import (
    build_training_examples,
    export_jsonl,
    load_feedback_jsonl,
)


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def feedback_to_recognition_rows(examples: List[Dict]) -> List[Dict]:
    """피드백 export 예시(task/target/images) → train.py recognition row 스키마.

    피드백은 현장 단위({task, target:{materials,hazards,...}, images:[...]})지만,
    학습기/평가기는 이미지 단위 recognition row({image, materials, hazards})를 먹는다.
    이미지가 여럿이면 같은 라벨을 이미지마다 편다. 자재 라벨 없으면 학습 가치가 없어 제외.
    """
    rows: List[Dict] = []
    for ex in examples:
        if ex.get("task") != "recognition":
            continue
        target = ex.get("target", {})
        materials = target.get("materials", [])
        if not materials:
            continue
        for img in ex.get("images", []):
            rows.append({
                "image": img,
                "materials": materials,
                "hazards": target.get("hazards", []),
                "source": "feedback",
                "task": "recognition",
                "label_source": ex.get("label_source", "accepted"),
            })
    return rows


def _load_jsonl(path: str) -> List[Dict]:
    rows: List[Dict] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def merge_training_data(base_path: Optional[str], feedback_rows: List[Dict],
                        out_path: str) -> Dict:
    """기존 학습셋 + 피드백 row 를 합쳐 다음 학습셋 JSONL 을 만든다.

    base_path 없으면(첫 사이클) 피드백만으로 구성. 결과는 out_path 에 기록.
    """
    base_rows = _load_jsonl(base_path) if base_path and os.path.exists(base_path) else []
    merged = base_rows + feedback_rows
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        for r in merged:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return {"base": len(base_rows), "feedback": len(feedback_rows), "total": len(merged)}


@dataclass
class CycleResult:
    """분기 재학습 사이클 결과(감사·배포 결정용)."""
    started_at: str
    task: str
    dry_run: bool
    dataset: Dict
    adapter_dir: str
    adapter_hash: Optional[str]
    eval_report: Dict
    gate_passed: bool
    promoted: bool
    deploy_manifest_path: Optional[str] = None
    steps: List[str] = field(default_factory=list)

    def as_dict(self) -> Dict:
        return {
            "started_at": self.started_at,
            "task": self.task,
            "dry_run": self.dry_run,
            "dataset": self.dataset,
            "adapter_dir": self.adapter_dir,
            "adapter_hash": self.adapter_hash,
            "eval_report": self.eval_report,
            "gate_passed": self.gate_passed,
            "promoted": self.promoted,
            "deploy_manifest_path": self.deploy_manifest_path,
            "steps": self.steps,
        }


def _promote(adapter_dir: str, eval_report: Dict, promoted: bool) -> Optional[str]:
    """평가 결과를 어댑터 대장에 반영하고, 통과 시 배포 매니페스트를 남긴다.

    train.py 가 남긴 model_version.json 의 `eval_passed: None` 자리를 채운다.
    통과 → status=candidate_promoted + deploy_manifest.json 기록.
    미달 → status=rejected 로 표시(이전 어댑터 유지, 승격 안 함).
    """
    mv_path = os.path.join(adapter_dir, "model_version.json")
    if not os.path.exists(mv_path):
        return None
    with open(mv_path, encoding="utf-8") as f:
        mv = json.load(f)
    mv["eval_passed"] = bool(eval_report.get("passed"))
    mv["eval_report"] = eval_report
    mv["status"] = "candidate_promoted" if promoted else "rejected"
    mv["evaluated_at"] = _utcnow()
    with open(mv_path, "w", encoding="utf-8") as f:
        json.dump(mv, f, ensure_ascii=False, indent=2)

    if not promoted:
        return None
    manifest_path = os.path.join(adapter_dir, "deploy_manifest.json")
    manifest = {
        "model_version": mv.get("model_version"),
        "adapter_dir": adapter_dir,
        "serve_command": (
            "vllm serve Qwen/Qwen3-VL-8B-Instruct --enable-lora "
            f"--lora-modules {os.path.basename(adapter_dir)}={adapter_dir}"
        ),
        "eval_report": eval_report,
        "promoted_at": _utcnow(),
        "note": "training/SERVING.md 절차로 서빙. 이전 어댑터는 /admin/reload 로 롤백 가능.",
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    return manifest_path


def run_cycle(
    config: Dict,
    *,
    evalset_path: str,
    out_dir: str,
    feedback_path: Optional[str] = None,
    base_train_path: Optional[str] = None,
    task: str = "recognition",
    do_train: bool = False,
    min_rating: int = 4,
) -> CycleResult:
    """분기 재학습 사이클을 실행한다.

    do_train=False(기본): 학습은 --dry-run 배선(GPU 불필요). 데이터·대장·게이트를 검증한다.
    do_train=True: 실 QLoRA 학습(GPU 필요) — Colab/GCP 에서만.
    """
    # 지연 임포트: training.train 은 실학습 경로에서만 무거운 의존성을 만진다.
    from training.train import train as run_train

    steps: List[str] = []
    os.makedirs(out_dir, exist_ok=True)

    # 1) 피드백 → 학습 예시 → recognition rows
    feedback_rows: List[Dict] = []
    if feedback_path and os.path.exists(feedback_path):
        records = load_feedback_jsonl(feedback_path)
        examples = build_training_examples(records, min_rating_for_accept=min_rating)
        # 감사용으로 원 예시도 남긴다(과업별).
        export_jsonl(examples, os.path.join(out_dir, "feedback_examples.jsonl"))
        feedback_rows = feedback_to_recognition_rows(examples)
    steps.append(f"feedback: {len(feedback_rows)} rows")

    # 2) 기존 학습셋과 병합
    merged_path = os.path.join(out_dir, f"train_{task}.jsonl")
    dataset = merge_training_data(base_train_path, feedback_rows, merged_path)
    steps.append(f"merge: {dataset}")

    # 3) 학습(dry-run 배선 or 실학습). config 를 이 사이클 산출 경로로 오버라이드.
    adapter_dir = os.path.join(out_dir, f"adapter-{task}")
    cfg = json.loads(json.dumps(config))  # 원본 불변 복사
    cfg.setdefault("tasks", {}).setdefault(task, {})
    cfg["tasks"][task]["train"] = merged_path
    cfg["tasks"][task]["output_adapter"] = adapter_dir
    run_train(cfg, task, dry_run=not do_train)
    steps.append(f"train: {'gpu' if do_train else 'dry-run'} → {adapter_dir}")

    adapter_hash = None
    meta_path = os.path.join(adapter_dir, "metadata.json")
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            adapter_hash = json.load(f).get("adapter_hash")

    # 4) 평가 게이트(§V3 재현율). 미달이면 승격하지 않는다.
    report = run_evalset(evalset_path).as_dict()
    gate_passed = bool(report.get("passed"))
    steps.append(
        f"eval: passed={gate_passed} "
        f"(자재재현율 {report.get('material_recall')}, 석면재현율 {report.get('asbestos_recall')})"
    )

    # 5) 통과 시에만 승격(대장 갱신 + 배포 매니페스트)
    manifest_path = _promote(adapter_dir, report, promoted=gate_passed)
    steps.append("promote: " + ("승격(배포 후보)" if gate_passed else "미달 → 이전 어댑터 유지"))

    return CycleResult(
        started_at=_utcnow(),
        task=task,
        dry_run=not do_train,
        dataset=dataset,
        adapter_dir=adapter_dir,
        adapter_hash=adapter_hash,
        eval_report=report,
        gate_passed=gate_passed,
        promoted=gate_passed,
        deploy_manifest_path=manifest_path,
        steps=steps,
    )
