# 디몰비전 AI 서버 — 기획서 §9(Docker 기반 GPU 업체 종속 회피).
# 이 이미지는 mock/groq 경로용이다(GPU 불필요). vllm 서빙은 CUDA 베이스로 별도 구성한다.
FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir .

COPY app ./app
# RAG 지식베이스 원문 — 없으면 안전지침이 통째로 비어 나온다(인용 강제 때문).
COPY kb_sources ./kb_sources

# Railway 는 PORT 를 주입한다. 로컬에서는 8000.
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
