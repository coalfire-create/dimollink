import { describe, expect, it, vi } from 'vitest';

/**
 * 지도 페이지 프레이밍 정책.
 *
 * 기본은 동일 출처만이다. 디몰비전(별도 서비스)이 같은 지도를 써야 해서 좁게 열되,
 * 그 목록에 적힌 오리진만 허용해야 한다. 실수로 전체를 열면 클릭재킹에 노출된다.
 * env 는 모듈 로드 시 1회 평가되므로 resetModules + 동적 import 로 각각 확인한다.
 */

async function headersFor(mapFrameAncestors: string): Promise<Record<string, string>> {
  vi.resetModules();
  vi.stubEnv('MAP_FRAME_ANCESTORS', mapFrameAncestors);
  const { createMapPageRouter } = await import('./map-page.js');

  const headers: Record<string, string> = {};
  const res = {
    setHeader: (k: string, v: string) => {
      headers[k.toLowerCase()] = v;
    },
    send: () => undefined,
  };
  const layer = (createMapPageRouter() as unknown as {
    stack: { route: { path: string; stack: { handle: Function }[] } }[];
  }).stack.find((l) => l.route?.path === '/map');
  layer!.route.stack[0]!.handle({ query: {} }, res, () => undefined);
  return headers;
}

describe('지도 iframe 허용 정책', () => {
  it('기본은 동일 출처만 — 외부 프레이밍을 막는다', async () => {
    const h = await headersFor('');
    expect(h['content-security-policy']).toBe("frame-ancestors 'self'");
    expect(h['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('허용 오리진을 지정하면 그 오리진만 추가된다', async () => {
    const h = await headersFor('https://dimolvision-web-production.up.railway.app');
    expect(h['content-security-policy']).toBe(
      "frame-ancestors 'self' https://dimolvision-web-production.up.railway.app",
    );
  });

  it('외부 허용 시 X-Frame-Options 를 빼 CSP 와 충돌하지 않게 한다', async () => {
    // 두 헤더가 함께 있으면 구형 브라우저가 X-Frame-Options 를 따라 iframe 을 막는다.
    const h = await headersFor('https://example.com');
    expect(h['x-frame-options']).toBeUndefined();
  });

  it('여러 오리진을 콤마로 받는다', async () => {
    const h = await headersFor('https://a.com, https://b.com');
    expect(h['content-security-policy']).toBe("frame-ancestors 'self' https://a.com https://b.com");
  });

  it('와일드카드로 전체를 열지 않는다(설정값을 그대로 쓸 뿐 * 를 만들지 않는다)', async () => {
    const h = await headersFor('');
    expect(h['content-security-policy']).not.toContain('*');
  });
});
