"""피드백 → 학습 데이터 편입 (기획서 §V5 데이터 플라이휠, §2.1).

feedback 의 수정 내용(corrected_result)·평가(rating)를 다음 학습 데이터로 축적한다.
파인튜닝은 과업별로 나눠 진행하므로(§4.2), 예시도 recognition/generation 으로 분리한다.

선택 규칙:
- corrected_result 있으면 → 사람이 교정한 정답(gold). recognition+generation 예시 생성.
- 없고 rating >= 임계(기본 4) → 모델 출력을 그대로 채택.
- 그 외(저평가·미교정) → 제외.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class FeedbackRecord:
    analysis_id: str
    image_paths: List[str]
    input_meta: Dict
    model_result: Dict
    corrected_result: Optional[Dict] = None
    rating: Optional[int] = None


RECOGNITION_FIELDS = ("site_summary", "materials", "hazards")
GENERATION_FIELDS = ("process_steps", "waste_plan")


def _target(result: Dict, fields) -> Dict:
    return {k: result[k] for k in fields if k in result}


def _accepted_result(rec: FeedbackRecord, min_rating: int) -> Optional[Dict]:
    if rec.corrected_result:
        return rec.corrected_result
    if rec.rating is not None and rec.rating >= min_rating:
        return rec.model_result
    return None


def build_training_examples(
    records: List[FeedbackRecord], *, min_rating_for_accept: int = 4
) -> List[Dict]:
    """사용 가능한 피드백을 과업별 학습 예시로 변환."""
    examples: List[Dict] = []
    for rec in records:
        result = _accepted_result(rec, min_rating_for_accept)
        if not result:
            continue
        base = {
            "analysis_id": rec.analysis_id,
            "images": rec.image_paths,
            "input_meta": rec.input_meta,
            "label_source": "correction" if rec.corrected_result else "accepted",
        }
        rec_target = _target(result, RECOGNITION_FIELDS)
        if rec_target:
            examples.append({**base, "task": "recognition", "target": rec_target})
        gen_target = _target(result, GENERATION_FIELDS)
        if gen_target:
            examples.append({**base, "task": "generation", "target": gen_target})
    return examples


def export_jsonl(examples: List[Dict], path: str) -> int:
    with open(path, "w", encoding="utf-8") as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")
    return len(examples)


def load_feedback_jsonl(path: str) -> List[FeedbackRecord]:
    records: List[FeedbackRecord] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            records.append(
                FeedbackRecord(
                    analysis_id=d["analysis_id"],
                    image_paths=d.get("image_paths", []),
                    input_meta=d.get("input_meta", {}),
                    model_result=d.get("model_result", {}),
                    corrected_result=d.get("corrected_result"),
                    rating=d.get("rating"),
                )
            )
    return records
