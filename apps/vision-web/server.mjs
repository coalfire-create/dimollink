import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

/**
 * 디몰비전 웹 서버 — 정적 서빙 + 디몰링크 API 프록시. 의존성 0.
 *
 * `apps/vision-web` 은 프레임워크 없는 정적 사이트라 별도 빌드가 필요 없다. 정적 호스팅을
 * 붙이는 대신 이 파일 하나로 Railway 에 올린다(본체 API 와 **다른 서비스**로 분리 —
 * 공모전 제출물이라 본체 배포 주기에 묶이면 안 된다).
 *
 * **프록시를 두는 이유**(주소 검색·역지오코딩·건축물대장):
 * 1. CORS 가 필요 없다. 브라우저는 자기 오리진하고만 통신한다.
 * 2. **데모 키가 브라우저에 노출되지 않는다.** 정적 JS 에 키를 박으면 누구나 꺼내 쓴다.
 *    서버가 헤더로 붙이면 키는 이 컨테이너 안에만 있다.
 *
 * 외부 패키지를 쓰지 않는 이유: 필요한 게 정적 서빙과 단순 프록시뿐이고, 의존성이 없으면
 * 공급망 취약점 알림·버전 업데이트에 끌려다닐 일이 없다.
 */

const ROOT = resolve(new URL('.', import.meta.url).pathname);
const PORT = Number(process.env.PORT ?? 8080);

/** 디몰링크 API. 공공데이터(건축물대장) 키와 지오코딩이 여기 있다. */
const DIMOLLINK_API = (
  process.env.DIMOLLINK_API_URL ?? 'https://demolink-api-production.up.railway.app/api'
).replace(/\/$/, '');

/** 본체의 데모 접근 키. 서버에만 둔다 — 브라우저로 내려보내지 않는다. */
const DEMO_KEY = process.env.VISION_DEMO_KEY ?? '';

/**
 * 프록시를 허용하는 경로. 화이트리스트로 둬야 이 서버가 본체 API 전체를 향한
 * 열린 통로가 되지 않는다(인증 필요한 경로까지 데모 키로 뚫리면 안 된다).
 */
const PROXY_ALLOWED = new Set([
  '/locations/search-address',
  '/locations/coord2address',
  '/locations/building-info',
]);

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

/**
 * 프록시 대상 경로인지 판정하고, 맞으면 본체 API 경로를 돌려준다.
 * 화이트리스트에 없으면 null — 임의 경로가 이 서버를 통해 본체로 새지 않게 한다.
 */
export function proxyTarget(url, allowed = PROXY_ALLOWED) {
  if (!url.startsWith('/api/')) return null;
  const [path, query] = url.slice('/api'.length).split('?');
  if (!allowed.has(path)) return null;
  return query ? `${path}?${query}` : path;
}

async function handleProxy(target, res) {
  try {
    const headers = { Accept: 'application/json' };
    // 데모 키는 서버에서만 붙인다 — 브라우저에 내려보내면 누구나 꺼내 쓴다.
    if (DEMO_KEY) headers['X-Demo-Key'] = DEMO_KEY;

    const upstream = await fetch(`${DIMOLLINK_API}${target}`, { headers });
    const body = await upstream.text();
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    // 본체가 죽어도 이 사이트는 살아 있어야 한다 — 화면이 사유를 보여준다.
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '디몰링크 연결에 실패했습니다.' }));
  }
}

const server = createServer((req, res) => {
  const target = proxyTarget(req.url ?? '/');
  if (target) {
    void handleProxy(target, res);
    return;
  }

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
