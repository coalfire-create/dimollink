import type { NextFunction, Request, Response } from 'express';

/**
 * 공모전 데모용 제한 접근 — 디몰비전 단독 배포에서만 쓴다.
 *
 * `/api/site-analysis` 는 호출당 비전 AI 비용과 공공데이터 쿼터를 쓰기 때문에 의도적으로
 * 로그인 필수다. 하지만 공모전 심사위원에게 계정을 만들라고 할 수는 없다.
 *
 * 그래서 **로그인을 대체하지 않고 옆에 문을 하나 더 낸다**:
 * - `VISION_DEMO_KEY` 가 설정된 경우에만 동작한다(기본 꺼짐 — 켜는 것이 명시적 결정이 되게).
 * - 그 키를 헤더로 제시한 요청만 통과시킨다.
 * - **일일 총량 상한**을 따로 건다. 분당 레이트리밋(10회)만으로는 하루치 비용을 못 막는다 —
 *   키가 정적 사이트에 박혀 공개되는 전제이므로, 남용되더라도 손실이 상한에서 멈춰야 한다.
 *
 * 키가 유출돼도 최악의 결과는 "그날 데모가 막힌다"이지 요금 폭탄이 아니다.
 */

export interface DemoAccessOptions {
  /** 미설정이면 데모 문 자체가 열리지 않는다. */
  demoKey?: string;
  /** 하루 허용 호출 수. */
  dailyLimit: number;
  /** 테스트에서 시간을 고정하기 위한 주입점. */
  now?: () => number;
}

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

export interface DemoAccessGate {
  /**
   * 인증 미들웨어를 감싼다. 유효한 데모 키가 오면 인증을 건너뛰고, 아니면 그대로 인증을 태운다.
   *
   * `next('route')` 로 건너뛰려 하면 안 된다 — 그건 라우터의 라우트 스택 안에서만 동작하고
   * `app.use()` 체인에서는 무시된다(인증이 그대로 걸려 데모가 통째로 막힌다).
   */
  wrap: (requireAuth: Middleware) => Middleware;
  /** 현재 사용량(운영 확인용). */
  usage: () => { used: number; limit: number; enabled: boolean };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 데모 키 헤더. 정적 사이트가 그대로 실어 보낸다. */
export const DEMO_KEY_HEADER = 'x-demo-key';

/**
 * 데모 게이트를 만든다. 통과시키면 `next()`, 아니면 다음 미들웨어(=requireAuth)로 넘긴다.
 * **인증을 무력화하지 않는다** — 데모 키가 없으면 원래대로 로그인을 요구한다.
 */
export function createDemoAccess(options: DemoAccessOptions): DemoAccessGate {
  const now = options.now ?? Date.now;
  let windowStart = now();
  let used = 0;

  function rollWindow(): void {
    const current = now();
    if (current - windowStart >= DAY_MS) {
      windowStart = current;
      used = 0;
    }
  }

  return {
    usage: () => {
      rollWindow();
      return { used, limit: options.dailyLimit, enabled: Boolean(options.demoKey) };
    },
    wrap(requireAuth) {
      return function demoOrAuth(req, res, next) {
        // 키 미설정 = 데모 문이 아예 없다. 원래대로 로그인을 요구한다.
        if (!options.demoKey) {
          requireAuth(req, res, next);
          return;
        }
        const presented = req.header(DEMO_KEY_HEADER);
        if (!presented || presented !== options.demoKey) {
          requireAuth(req, res, next);
          return;
        }

        rollWindow();
        if (used >= options.dailyLimit) {
          res.status(429).json({
            error: '오늘의 체험 횟수를 모두 사용했습니다. 내일 다시 이용해 주세요.',
          });
          return;
        }
        used += 1;
        (req as Request & { demoAccess?: boolean }).demoAccess = true;
        next();
      };
    },
  };
}
