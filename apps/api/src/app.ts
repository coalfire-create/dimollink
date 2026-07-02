import cors from 'cors';
import express from 'express';
import { createAllbaroRouter } from './routes/allbaro.js';
import { healthRouter } from './routes/health.js';
import { createMatchingRouter } from './routes/matching.js';
import { createPaymentsRouter } from './routes/payments.js';

/** Express 앱 구성 (서버 기동과 분리해 테스트에서 재사용 가능). */
export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api', healthRouter);
  app.use('/api', createAllbaroRouter());
  app.use('/api', createPaymentsRouter());
  app.use('/api', createMatchingRouter());

  return app;
}
