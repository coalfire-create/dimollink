"""API 키 인증 (기획서 §3.1, §5.1 — 프론트 직접 호출 금지, Edge Function 전용).

/v1/* 는 Edge Function API 키, /admin/* 는 관리자 키로 보호한다.
키 비교는 타이밍 공격 방지를 위해 상수시간 비교(hmac.compare_digest)를 쓴다.
"""

from __future__ import annotations

import hmac

from fastapi import Depends, HTTPException, Request, Security, status
from fastapi.security import APIKeyHeader

from .config import Settings, get_settings

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 API 키")


def require_api_key(
    provided: str = Security(_api_key_header),
    settings: Settings = Depends(get_settings),
) -> None:
    """Edge Function 전용 엔드포인트(/v1/jobs 등) 보호."""
    if not provided or not hmac.compare_digest(provided, settings.api_key):
        raise _unauthorized()


def require_admin_key(
    provided: str = Security(_api_key_header),
    settings: Settings = Depends(get_settings),
) -> None:
    """관리자 전용 엔드포인트(/admin/*) 보호."""
    if not provided or not hmac.compare_digest(provided, settings.admin_key):
        raise _unauthorized()
