import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersistenceFactory } from '../lib/json-collection.js';

/** 테스트용 인메모리 영속화(파일 IO 없이 createApp 구동). */
const memoryPersistenceFactory: PersistenceFactory = () => ({
  load: () => [],
  save: () => {},
});

/**
 * FEATURE_INTERIOR 게이트가 app.ts 배선에서 실제로 동작하는지 검증한다.
 * - 꺼짐(기본): /api/interior/* 경로 자체가 없어 404 → 파일럿 흐름에 영향 없음.
 * - 켜짐: 경로가 존재하고 인증을 요구(401) → 라우터가 마운트됨.
 * env 는 모듈 로드 시 1회 평가되므로 resetModules + 동적 import 로 각각 확인한다.
 */

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function startApp(): Promise<string> {
  const { createApp } = await import('../app.js');
  const app = createApp(memoryPersistenceFactory);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

describe('FEATURE_INTERIOR 게이트', () => {
  it('꺼져 있으면 인테리어 경로는 404', async () => {
    vi.stubEnv('FEATURE_INTERIOR', '');
    vi.resetModules();
    const base = await startApp();
    const res = await fetch(`${base}/api/interior/requests`);
    expect(res.status).toBe(404);
  });

  it('켜져 있으면 경로가 존재하고 인증을 요구(401)', async () => {
    vi.stubEnv('FEATURE_INTERIOR', 'true');
    vi.resetModules();
    const base = await startApp();
    const res = await fetch(`${base}/api/interior/requests`);
    expect(res.status).toBe(401);
  });
});
