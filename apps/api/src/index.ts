import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

app.listen(env.port, () => {
  // 서버 로그에는 PII/시크릿을 남기지 않는다 (CLAUDE.md 절대 규칙).
  console.log(`[dimol-api] listening on http://localhost:${env.port} (${env.nodeEnv})`);
});
