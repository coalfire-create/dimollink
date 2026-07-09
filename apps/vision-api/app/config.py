"""환경 기반 설정 (기획서 §7.2 — 모든 키는 .env 로만 관리, 하드코딩 금지)."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="VISION_", env_file=".env", extra="ignore"
    )

    # 인증 키 — Edge Function 전용 API 키, 관리자 키. .env 에서 주입.
    api_key: str = "dev-edge-key"
    admin_key: str = "dev-admin-key"
    # Supabase 콜백 서명용 시크릿(콜백 수신 측이 검증). 없으면 콜백에 헤더 미포함.
    callback_secret: str = ""

    # 모델 식별 — 모든 result.model_version 에 base + adapter 해시로 기록(§5.1).
    model_base: str = "Qwen/Qwen3-VL-8B-Instruct"
    model_adapter_hash: str = "mock"

    # 추론 파이프라인 선택: mock(로컬/CI) | vllm(GPU 서빙).
    pipeline: str = "mock"

    # 잡 저장소(초기 SQLite, 트래픽 증가 시 Redis 로 교체 — §3.3).
    db_path: str = "vision_jobs.db"

    # 재시도 상한(§3.2 — 최종 실패 전 최대 2회) 및 잡 타임아웃(초).
    max_retries: int = 2
    job_timeout_seconds: int = 180

    # 사진 장수 상한(기획서 §2.1 — 1~10장).
    max_photos: int = 10

    # RAG 지식베이스(§3.4) — 원문 디렉터리와 검색 top-k.
    kb_sources_dir: str = "kb_sources"
    kb_top_k: int = 3
    # 검색기 백엔드: memory(로컬/CI) | pg(pgvector). 임베더: mock | bge-m3.
    kb_backend: str = "memory"
    kb_embedder: str = "mock"
    # Postgres DSN (PgRetriever/PgWriter 용). 비우면 memory 검색기로 폴백.
    db_url: str = ""

    # vLLM OpenAI 호환 엔드포인트(§3.3 — GPU 서빙). pipeline=vllm 일 때 사용.
    vllm_base_url: str = "http://localhost:8000/v1"
    vllm_api_key: str = ""
    # LoRA 어댑터 이름(vLLM --enable-lora 서빙 시). 설정하면 채팅 요청의 model 로 사용
    # (예: recognition-ground-v1). 비우면 base 모델을 그대로 호출.
    vllm_lora: str = ""

    environment: str = "local"

    @property
    def model_version(self) -> str:
        """base 모델 + LoRA 어댑터 해시. 품질 추적·A/B 평가의 키(§5.1)."""
        return f"{self.model_base}+{self.model_adapter_hash}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
