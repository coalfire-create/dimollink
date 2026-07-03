import { Router } from 'express';

export const healthRouter = Router();

/** 라이브니스 — 프로세스가 살아있는지(오케스트레이터 재시작 판단용). */
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'dimol-api', time: new Date().toISOString() });
});
healthRouter.get('/health/live', (_req, res) => {
  res.json({ status: 'ok' });
});

/**
 * 레디니스 — 트래픽 수용 준비 여부.
 * 이 아키텍처에선 저장소(PostgreSQL) 프리로드 성공 후에만 서버가 기동되므로,
 * 응답 가능 = 준비 완료로 간주한다(로드밸런서 헬스체크용).
 */
healthRouter.get('/health/ready', (_req, res) => {
  res.json({ status: 'ready', uptimeSec: Math.floor(process.uptime()) });
});
