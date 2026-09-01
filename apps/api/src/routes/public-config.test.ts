import type { Server } from 'node:http';
import type { AddressInfo } from 'net';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPublicConfigRouter } from './public-config.js';

/**
 * 공개 설정 — 지도 JS 키를 런타임에 내려준다.
 * 여기에 시크릿이 새어 나가면 그대로 브라우저에 노출되므로 응답 형태를 고정한다.
 */

let server: Server;
let base: string;

beforeEach(async () => {
  const app = express();
  app.use('/api', createPublicConfigRouter());
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe('GET /api/config/public', () => {
  it('로그인 없이 조회되고 kakaoJsKey 키를 준다', async () => {
    const res = await fetch(`${base}/api/config/public`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect('kakaoJsKey' in body).toBe(true);
  });

  it('공개해도 되는 필드만 내려간다(서버 시크릿 유출 방지)', async () => {
    const body = (await (await fetch(`${base}/api/config/public`)).json()) as Record<string, unknown>;
    // 화이트리스트: 여기 없는 키가 생기면 테스트가 깨져서 검토를 강제한다.
    expect(Object.keys(body).sort()).toEqual(['kakaoJsKey']);
  });

  it('캐시 헤더를 붙여 앱이 반복 호출하지 않게 한다', async () => {
    const res = await fetch(`${base}/api/config/public`);
    expect(res.headers.get('cache-control')).toContain('max-age');
  });
});
