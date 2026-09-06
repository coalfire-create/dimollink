import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

/**
 * 디몰비전 웹 정적 서버 — 의존성 0.
 *
 * `apps/vision-web` 은 프레임워크 없는 정적 사이트라 별도 빌드가 필요 없다. 정적 호스팅을
 * 붙이는 대신 이 파일 하나로 Railway 에 올린다(본체 API 와 **다른 서비스**로 분리 —
 * 공모전 제출물이라 본체 배포 주기에 묶이면 안 된다).
 *
 * 외부 패키지를 쓰지 않는 이유: 정적 파일 서빙에 필요한 건 40줄이고, 의존성이 없으면
 * 공급망 취약점 알림·버전 업데이트에 끌려다닐 일이 없다.
 */

const ROOT = resolve(new URL('.', import.meta.url).pathname);
const PORT = Number(process.env.PORT ?? 8080);

/** 확장자 → Content-Type. 목록에 없으면 다운로드되지 않게 octet-stream 으로 둔다. */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * 요청 경로 → 실제 파일 경로. 루트를 벗어나면 null.
 * `..` 경로 탈출을 막는 것이 이 함수의 유일한 목적이므로 normalize 후 접두사를 검사한다.
 */
export function resolveFile(urlPath, root = ROOT) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const target = normalize(join(root, relative));
  if (!target.startsWith(root)) return null; // 경로 탈출 차단
  if (existsSync(target) && statSync(target).isDirectory()) {
    return normalize(join(target, 'index.html'));
  }
  return target;
}

/** 캐시 정책 — HTML 은 배포 즉시 반영돼야 하고, 나머지는 짧게 캐시한다. */
export function cacheControlFor(file) {
  return file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600';
}

const server = createServer((req, res) => {
  const file = resolveFile(req.url ?? '/');

  if (!file || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('찾을 수 없습니다');
    return;
  }

  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': cacheControlFor(file),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  createReadStream(file).pipe(res);
});

// 테스트에서 import 할 때는 서버를 띄우지 않는다.
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`[vision-web] http://0.0.0.0:${PORT} 에서 서빙 중`);
  });
}

export { server };
