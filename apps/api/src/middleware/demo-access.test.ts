import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_KEY_HEADER, createDemoAccess } from './demo-access.js';

/** 헤더만 흉내 내는 최소 요청 객체. */
function req(headers: Record<string, string> = {}): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function res() {
  const sent: { status?: number; body?: unknown } = {};
  const r = {
    status(code: number) {
      sent.status = code;
      return r;
    },
    json(body: unknown) {
      sent.body = body;
      return r;
    },
  };
  return { res: r as unknown as Response, sent };
}

/** 호출 여부를 기록하는 가짜 인증 미들웨어. */
function fakeAuth() {
  const calls: number[] = [];
  const mw = (_q: Request, _s: Response, next: NextFunction) => {
    calls.push(1);
    next();
  };
  return { mw, get calledTimes() { return calls.length; } };
}

describe('createDemoAccess — 인증을 대체하지 않고 옆에 문을 낸다', () => {
  it('키가 설정되지 않으면 데모 문이 아예 없다(기본 꺼짐)', () => {
    const auth = fakeAuth();
    const gate = createDemoAccess({ dailyLimit: 100 });
    const next = vi.fn();

    gate.wrap(auth.mw)(req({ [DEMO_KEY_HEADER]: 'anything' }), res().res, next);

    // 키가 없으면 무조건 원래 인증을 태운다.
    expect(auth.calledTimes).toBe(1);
    expect(gate.usage().enabled).toBe(false);
  });

  it('키가 틀리면 그대로 인증을 요구한다', () => {
    const auth = fakeAuth();
    const gate = createDemoAccess({ demoKey: 'secret', dailyLimit: 100 });

    gate.wrap(auth.mw)(req({ [DEMO_KEY_HEADER]: 'wrong' }), res().res, vi.fn());
    gate.wrap(auth.mw)(req(), res().res, vi.fn()); // 헤더 없음

    expect(auth.calledTimes).toBe(2);
    expect(gate.usage().used).toBe(0);
  });

  it('키가 맞으면 인증을 건너뛴다', () => {
    const auth = fakeAuth();
    const gate = createDemoAccess({ demoKey: 'secret', dailyLimit: 100 });
    const next = vi.fn();

    gate.wrap(auth.mw)(req({ [DEMO_KEY_HEADER]: 'secret' }), res().res, next);

    expect(auth.calledTimes).toBe(0);
    expect(next).toHaveBeenCalledOnce();
    expect(gate.usage().used).toBe(1);
  });

  it('일일 상한을 넘으면 막는다 — 키가 공개돼도 손실이 상한에서 멈춘다', () => {
    const auth = fakeAuth();
    const gate = createDemoAccess({ demoKey: 'secret', dailyLimit: 2 });

    for (let i = 0; i < 2; i += 1) {
      gate.wrap(auth.mw)(req({ [DEMO_KEY_HEADER]: 'secret' }), res().res, vi.fn());
    }
    const third = res();
    const next = vi.fn();
    gate.wrap(auth.mw)(req({ [DEMO_KEY_HEADER]: 'secret' }), third.res, next);

    expect(third.sent.status).toBe(429);
    expect(next).not.toHaveBeenCalled();
    // 상한을 넘어도 인증 경로로 새지 않는다(우회 금지).
    expect(auth.calledTimes).toBe(0);
  });

  it('하루가 지나면 사용량이 초기화된다', () => {
    let clock = 0;
    const auth = fakeAuth();
    const gate = createDemoAccess({ demoKey: 'secret', dailyLimit: 1, now: () => clock });

    gate.wrap(auth.mw)(req({ [DEMO_KEY_HEADER]: 'secret' }), res().res, vi.fn());
    expect(gate.usage().used).toBe(1);

    clock += 24 * 60 * 60 * 1000 + 1;
    const next = vi.fn();
    gate.wrap(auth.mw)(req({ [DEMO_KEY_HEADER]: 'secret' }), res().res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('사용량을 조회할 수 있다(운영 확인용)', () => {
    const gate = createDemoAccess({ demoKey: 'secret', dailyLimit: 50 });
    expect(gate.usage()).toEqual({ used: 0, limit: 50, enabled: true });
  });
});
