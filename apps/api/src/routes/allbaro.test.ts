import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import type { AllbaroClient } from '../allbaro/client.js';
import { createAllbaroRouter } from './allbaro.js';

/**
 * 올바로 라우트 — **경로 매칭 순서**를 실제 서버로 확인한다.
 *
 * `/manifest/:manifestNo` 가 `/manifest/queue` 보다 먼저 등록돼 있으면 "queue" 가
 * 인계서 번호로 해석돼 올바로에 조회를 날린다. 그러면 관리자의 재시도 큐·실패 목록
 * 화면이 통째로 죽는데, 라우트는 분명히 파일에 있으니 코드만 봐서는 멀쩡해 보인다.
 * 실제로 이 상태로 있었고, 큐에 쌓인 미신고 건을 아무도 볼 수 없었다.
 */

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

/** 호출되면 실패하는 클라이언트 — 라우트가 올바로로 새면 바로 드러난다. */
const throwingClient = {
  getManifestStatus: async (manifestNo: string) => {
    throw new Error(`올바로로 새어나감: ${manifestNo}`);
  },
} as unknown as AllbaroClient;

async function start(): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use('/api', createAllbaroRouter(throwingClient));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

describe('GET /api/allbaro/manifest/queue|failures — 관리자 조회', () => {
  it('큐 조회가 인계서 번호 조회로 새지 않는다', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/allbaro/manifest/queue`);
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it('실패 목록 조회도 마찬가지다', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/allbaro/manifest/failures`);
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it('진짜 인계서 번호는 그대로 조회로 간다', async () => {
    const base = await start();
    // 던지는 클라이언트라 500 이 나야 정상 — :manifestNo 핸들러에 도달했다는 뜻.
    const res = await fetch(`${base}/api/allbaro/manifest/MN-2026-0001`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
