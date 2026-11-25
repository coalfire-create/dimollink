"""Supabase 콜백 클라이언트 (기획서 §3.2 — 진행/완료를 Supabase 에 업데이트).

콜백은 best-effort 다. 실패해도 잡은 계속 진행하며, 클라이언트는 GET /v1/jobs/{id}
폴링으로 폴백한다(§5.1). 따라서 여기서 예외를 삼키고 로깅만 한다.
"""

from __future__ import annotations

import ipaddress
import logging
from typing import Optional
from urllib.parse import urlparse

import httpx

from .schemas import JobResponse

logger = logging.getLogger("vision.callback")


def is_safe_callback_url(url: str, *, allow_local: bool = False) -> bool:
    """콜백 URL 의 SSRF 위험을 막기 위해 스킴·호스트를 검증한다."""
    try:
        parsed = urlparse(url.strip())
    except Exception:
        return False

    scheme = (parsed.scheme or "").lower()
    if allow_local:
        if scheme not in ("http", "https"):
            return False
    elif scheme != "https":
        return False

    host = (parsed.hostname or "").strip().lower()
    if not host:
        return False

    if not allow_local:
        if host == "localhost" or host.endswith((".local", ".internal")):
            return False
        try:
            ip = ipaddress.ip_address(host)
            if not ip.is_global:
                return False
        except ValueError:
            pass

    return True


async def post_update(
    callback_url: Optional[str],
    job: JobResponse,
    secret: str = "",
    *,
    allow_local: bool = False,
) -> None:
    if not callback_url:
        return
    if not is_safe_callback_url(callback_url, allow_local=allow_local):
        logger.warning("차단된 callback_url job=%s", job.id)
        return
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Callback-Secret"] = secret
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
            await client.post(
                callback_url,
                content=job.model_dump_json(),
                headers=headers,
            )
    except Exception as exc:  # noqa: BLE001 — 콜백 실패는 폴링으로 폴백
        logger.warning("콜백 전송 실패 job=%s: %s", job.id, exc)
