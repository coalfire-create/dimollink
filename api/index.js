import { createApp } from '../apps/api/dist/app.js';
import { env } from '../apps/api/dist/config/env.js';
import { jsonPersistenceFactory } from '../apps/api/dist/lib/json-collection.js';
import { createPgPool, initPgPersistence } from '../apps/api/dist/lib/pg-collection.js';

// 서버리스(임시 파일시스템)에서는 데이터가 유지되지 않으므로 운영은 DATABASE_URL(PostgreSQL) 필수.
const persistence = env.databaseUrl
  ? await initPgPersistence(createPgPool(env.databaseUrl))
  : jsonPersistenceFactory(env.dataDir);

export default createApp(persistence);
