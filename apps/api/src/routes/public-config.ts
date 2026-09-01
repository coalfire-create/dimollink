import { Router } from 'express';
import { env } from '../config/env.js';

/**
 * 앱이 기동 시 받아가는 공개 설정.
 *
 * 클라이언트에 노출돼도 되는 값만 담는다 — 지금은 카카오 지도 JavaScript 키 하나다.
 * 이 키는 브라우저에 실려야 지도가 뜨는 공개 키이며(카카오 콘솔의 허용 도메인으로 보호),
 * 서버 시크릿(REST 키·PG·올바로)은 절대 여기에 넣지 않는다.
 *
 * 빌드에 키를 박지 않고 런타임에 내려주는 이유: 키를 바꿀 때 앱·웹 번들을 다시 빌드하지 않고
 * 환경변수만 교체하면 되고, 웹·안드로이드 양쪽이 같은 경로로 값을 받는다.
 */
export function createPublicConfigRouter(): Router {
  const router = Router();

  router.get('/config/public', (_req, res) => {
    // 값이 바뀌는 일이 드물어 짧게 캐시한다(앱은 세션당 1회만 호출).
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      kakaoJsKey: env.publicConfig.kakaoJsKey ?? null,
    });
  });

  return router;
}
