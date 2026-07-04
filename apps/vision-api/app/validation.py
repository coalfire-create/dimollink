"""출력 검증 레이어 (기획서 §7.1 — 가장 중요).

packages/shared 의 validateVisionReport 와 동일 규칙의 Python 미러.
AI 서버가 리포트를 저장/콜백하기 전 반드시 통과시켜야 하는 2차 방어선이다.
"""

from __future__ import annotations

import re
from typing import List

from .schemas import VisionReport
from .taxonomy import (
    ASBESTOS_SUSPECT_GUIDANCE,
    REPORT_DISCLAIMER,
    is_asbestos_suspect_material,
    is_material_code,
)

# 석면 유무를 "확정"하는 금지 표현 (AI 는 의심/조사 필요까지만 표현).
_FORBIDDEN_ASBESTOS_CONFIRMATION = [
    re.compile(r"석면\s*(임|입니다|이다|확인|확정|검출됨|존재함|없음|아님)"),
    re.compile(r"석면이\s*(있|없)"),
    re.compile(r"(무|비)석면\s*(확정|확인)"),
]


def validate_report(report: VisionReport) -> List[str]:
    """계약·안전 규칙 위반 목록 반환. 빈 리스트면 통과."""
    issues: List[str] = []

    # 1) 고지 고정 문구 필수
    if report.disclaimer != REPORT_DISCLAIMER:
        issues.append("disclaimer 가 고정 고지 문구와 일치하지 않습니다.")

    # 2) 자재 코드·신뢰도 검증
    for i, m in enumerate(report.materials):
        if not is_material_code(m.category):
            issues.append(f"materials[{i}].category 가 분류 체계 v1 코드가 아닙니다: {m.category}")
        if not (0.0 <= m.confidence <= 1.0):
            issues.append(f"materials[{i}].confidence 는 0~1 범위여야 합니다: {m.confidence}")

    # 3) 석면 의심 자재 인식 시 hazards 에 ASBESTOS_SUSPECT 필수
    has_asbestos_material = any(
        is_material_code(m.category) and is_asbestos_suspect_material(m.category)
        for m in report.materials
    )
    asbestos_hazards = [h for h in report.hazards if h.type == "ASBESTOS_SUSPECT"]
    if has_asbestos_material and not asbestos_hazards:
        issues.append(
            "석면 의심 자재(슬레이트 등) 인식 시 hazards 에 ASBESTOS_SUSPECT 를 포함해야 합니다."
        )

    # 4) 석면 의심 hazard 는 전문 조사 안내 문구 포함 필수
    for i, h in enumerate(asbestos_hazards):
        if ASBESTOS_SUSPECT_GUIDANCE not in h.guidance:
            issues.append(f"hazards ASBESTOS_SUSPECT[{i}] 는 전문 조사 안내를 포함해야 합니다.")

    # 5) 석면 유무 "확정" 표현 금지 — 리포트 전체 텍스트 스캔
    scanned_parts = [report.site_summary.scale_estimate]
    scanned_parts += [m.location_note for m in report.materials]
    for h in report.hazards:
        scanned_parts += [h.description, h.guidance]
    for s in report.process_steps:
        scanned_parts += [g.text for g in s.safety_guidelines]
    scanned = "\n".join(scanned_parts)
    if any(p.search(scanned) for p in _FORBIDDEN_ASBESTOS_CONFIRMATION):
        issues.append(
            '석면 유무를 확정하는 표현이 감지되었습니다(§7.1 위반). "의심/조사 필요"로만 표기해야 합니다.'
        )

    return issues
