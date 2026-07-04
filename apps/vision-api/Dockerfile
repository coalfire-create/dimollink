# 디몰비전 AI 서버 — 이식성 유지용 컨테이너(기획서 §9: Docker 기반 GPU 업체 종속 회피).
# GPU 서빙(vllm) 이미지는 CUDA 베이스로 별도 구성한다. 이 이미지는 앱/mock 서빙용.
FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir .

COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
