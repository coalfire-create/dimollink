import type { NextFunction, Request, Response, Router } from 'express';

type AnyHandler = (req: Request, res: Response, next: NextFunction) => unknown;

/**
 * Express 4 라우터의 비동기 핸들러에서 던져진 Promise 거부를 next(err)로 전달해
 * 중앙 오류 미들웨어가 잡도록 보장한다. (Express 4는 async 거부를 자동 catch하지 않음.)
 */
export function wrapAsyncRouter(router: Router): Router {
  const stack = (router as unknown as { stack?: Array<{ route?: { stack?: Array<{ handle: AnyHandler }> } }> }).stack;
  if (!Array.isArray(stack)) return router;

  for (const layer of stack) {
    const routeStack = layer.route?.stack;
    if (!Array.isArray(routeStack)) continue;
    for (const routeLayer of routeStack) {
      const orig = routeLayer.handle;
      if (typeof orig !== 'function' || orig.length >= 4) continue;
      routeLayer.handle = function asyncWrapped(
        this: unknown,
        req: Request,
        res: Response,
        next: NextFunction,
      ) {
        try {
          const result = orig.call(this, req, res, next);
          if (result && typeof (result as Promise<unknown>).catch === 'function') {
            (result as Promise<unknown>).catch(next);
          }
        } catch (err) {
          next(err);
        }
      };
    }
  }
  return router;
}
