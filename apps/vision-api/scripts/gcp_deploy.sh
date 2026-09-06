#!/bin/bash
# 구글 클라우드 Compute Engine (GPU 인스턴스) 원클릭 배포 스크립트

set -e

echo "================================================="
echo " 디몰비전 AI 서버 GCP GPU 인스턴스 배포 스크립트 "
echo "================================================="

# 1. 도커 설치 확인 및 설치
if ! command -v docker &> /dev/null
then
    echo "[1/4] Docker가 설치되어 있지 않습니다. 설치를 진행합니다..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm get-docker.sh
    sudo usermod -aG docker $USER
    echo "Docker 설치 완료."
else
    echo "[1/4] Docker가 이미 설치되어 있습니다."
fi

# 2. NVIDIA Container Toolkit 설치 확인
if ! command -v nvidia-container-cli &> /dev/null
then
    echo "[2/4] NVIDIA Container Toolkit을 설치합니다..."
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg \
      && curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
        sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
        sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    sudo apt-get update
    sudo apt-get install -y nvidia-container-toolkit
    sudo systemctl restart docker
    echo "NVIDIA Container Toolkit 설치 완료."
else
    echo "[2/4] NVIDIA Container Toolkit이 이미 설치되어 있습니다."
fi

# 3. 환경변수 파일 검증
if [ ! -f ".env" ]; then
    echo "⚠️ .env 파일이 없습니다. .env.example을 복사하여 기본 .env를 생성합니다."
    cp .env.example .env
    echo "가급적 .env 파일을 실제 키값으로 수정하신 후 다시 실행해주세요."
fi

# 4. 도커 컨테이너 빌드 및 실행
echo "[3/4] GPU용 Docker 컨테이너를 빌드합니다 (시간이 다소 소요될 수 있습니다)..."
sudo docker build -t dimol-vision-api-gpu -f Dockerfile.gpu .

echo "[4/4] 기존 컨테이너가 있다면 중지 및 삭제하고 새로 띄웁니다..."
sudo docker rm -f dimol-vision-gpu-server || true

sudo docker run -d \
    --name dimol-vision-gpu-server \
    --gpus all \
    -p 8000:8000 \
    --env-file .env \
    -v $(pwd)/data/models:/app/data/models \
    --restart unless-stopped \
    dimol-vision-api-gpu

echo "================================================="
echo "✅ 배포가 완료되었습니다!"
echo "서버 로그 확인: sudo docker logs -f dimol-vision-gpu-server"
echo "서버 헬스 체크: curl http://localhost:8000/v1/health"
echo "외부 접속: GCP 방화벽 설정에서 8000번 포트를 열어주세요."
echo "================================================="
