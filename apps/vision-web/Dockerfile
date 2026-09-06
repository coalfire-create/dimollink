# 디몰비전 웹 — 공모전 제출용 정적 사이트(본체 API 와 별도 Railway 서비스).
# 프레임워크 없는 HTML/JS 라 빌드 단계가 없다. 의존성 0 서버 하나만 얹는다.
FROM node:20-slim
WORKDIR /app
COPY . .
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.mjs"]
