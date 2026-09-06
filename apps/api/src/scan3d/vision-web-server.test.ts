import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cacheControlFor, resolveFile } from '../../../vision-web/server.mjs';

/**
 * 디몰비전 웹 정적 서버 — 경로 탈출 차단이 핵심이다.
 * 정적 서버의 유일한 보안 표면이 여기라, 규칙을 테스트로 못 박는다.
 */

const ROOT = resolve(process.cwd(), 'apps/vision-web');

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
