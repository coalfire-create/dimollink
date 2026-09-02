# 디몰링크 API — Railway 배포용 컨테이너.
# 빌더(Nixpacks/Railpack) 자동감지에 흔들리지 않도록 Dockerfile 로 빌드를 고정한다.
FROM node:20-slim

WORKDIR /app

# 의존성 설치 계층 캐시 최적화: 매니페스트 먼저 복사.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/

# tsc 빌드에 @types/*·typescript(devDependencies)가 필요하므로 --include=dev 로 강제 포함.
# (NODE_ENV=production 이어도 devDeps 를 설치한다.)
RUN npm ci --include=dev

COPY . .

# 배포 게이트: 타입체크 + 유닛테스트. 실패하면 이미지가 만들어지지 않아 배포가 멈춘다.
# (빌드가 실패해도 직전 성공 배포가 계속 서빙되므로 서비스는 내려가지 않는다.)
# 빌드 명령은 이 Dockerfile 에 있고 루트 `npm run build` 를 거치지 않으므로,
# 게이트를 루트 build 스크립트에만 걸면 배포에는 적용되지 않는다 — 여기서 직접 부른다.
RUN npm run verify

# shared → mobile → api 순서로 빌드(mobile 이 shared 타입을, api 가 mobile 웹 산출물을 쓴다).
RUN npm run build:shared && npm run build -w @dimol/mobile && npm run build -w @dimol/api

ENV NODE_ENV=production
# 서버는 process.env.PORT 를 사용(Railway 가 주입). 문서용 EXPOSE.
EXPOSE 4000

CMD ["node", "apps/api/dist/index.js"]
