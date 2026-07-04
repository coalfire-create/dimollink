"""Supabase 콜백 클라이언트 (기획서 §3.2 — 진행/완료를 Supabase 에 업데이트).

콜백은 best-effort 다. 실패해도 잡은 계속 진행하며, 클라이언트는 GET /v1/jobs/{id}
폴링으로 폴백한다(§5.1). 따라서 여기서 예외를 삼키고 로깅만 한다.
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from .schemas import JobResponse

logger = logging.getLogger("vision.callback")


async def post_update(
    callback_url: Optional[str], job: JobResponse, secret: str = ""
) -> None:
    if not callback_url:
        return
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Callback-Secret"] = secret
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                callback_url,
                content=job.model_dump_json(),
                headers=headers,
            )
    except Exception as exc:  # noqa: BLE001 — 콜백 실패는 폴링으로 폴백
        logger.warning("콜백 전송 실패 job=%s: %s", job.id, exc)
