import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cacheControlFor, proxyTarget, resolveFile } from '../../../vision-web/server.mjs';

/**
 * 디몰비전 웹 정적 서버 — 경로 탈출 차단이 핵심이다.
 * 정적 서버의 유일한 보안 표면이 여기라, 규칙을 테스트로 못 박는다.
 */

// ⚠️ process.cwd() 로 잡으면 안 된다 — vitest 워크스페이스마다 cwd 가 달라
// 단독 실행은 통과하고 전체 스위트에서만 깨진다. 테스트 파일 위치를 기준으로 잡는다.
const ROOT = fileURLToPath(new URL('../../../vision-web', import.meta.url));

describe('resolveFile — 경로 탈출 차단', () => {
  it('루트 요청은 index.html 로 간다', () => {
    expect(resolveFile('/', ROOT)).toBe(`${ROOT}/index.html`);
  });

  it('일반 파일을 정상 해석한다', () => {
    expect(resolveFile('/styles.css', ROOT)).toBe(`${ROOT}/styles.css`);
    expect(resolveFile('/lib/report.js', ROOT)).toBe(`${ROOT}/lib/report.js`);
  });

  it('상위 경로 탈출을 막는다', () => {
    for (const attack of [
      '/../package.json',
      '/../../.env',
      '/lib/../../../etc/passwd',
      '/%2e%2e/%2e%2e/package.json',
    ]) {
      expect(resolveFile(attack, ROOT)).toBeNull();
    }
  });

  it('쿼리스트링을 떼고 해석한다', () => {
    expect(resolveFile('/styles.css?v=2', ROOT)).toBe(`${ROOT}/styles.css`);
  });

  it('디렉터리 요청은 그 안의 index.html 로 간다', () => {
    expect(resolveFile('/lib', ROOT)).toBe(`${ROOT}/lib/index.html`);
  });
});

describe('cacheControlFor — HTML 은 배포 즉시 반영돼야 한다', () => {
  it('HTML 은 캐시하지 않는다', () => {
    expect(cacheControlFor('/a/index.html')).toBe('no-cache');
  });

  it('정적 자산은 짧게 캐시한다', () => {
    expect(cacheControlFor('/a/app.js')).toContain('max-age');
  });
});

describe('proxyTarget — 본체 API 프록시 화이트리스트', () => {
  it('허용된 경로만 통과시킨다', () => {
    expect(proxyTarget('/api/locations/search-address?query=x')).toBe(
      '/locations/search-address?query=x',
    );
    expect(proxyTarget('/api/locations/coord2address?lat=1&lng=2')).toBe(
      '/locations/coord2address?lat=1&lng=2',
    );
    expect(proxyTarget('/api/locations/building-info?address=x')).toBe(
      '/locations/building-info?address=x',
    );
  });

  it('화이트리스트 밖 경로는 막는다 — 이 서버가 본체로 향한 열린 통로가 되면 안 된다', () => {
    for (const url of [
      '/api/users',
      '/api/requests',
      '/api/admin/metrics',
      '/api/auth/login',
      '/api/locations/search-address/../../users',
    ]) {
      expect(proxyTarget(url)).toBeNull();
    }
  });

  it('/api 로 시작하지 않으면 정적 파일로 다룬다', () => {
    expect(proxyTarget('/styles.css')).toBeNull();
    expect(proxyTarget('/')).toBeNull();
  });
});
