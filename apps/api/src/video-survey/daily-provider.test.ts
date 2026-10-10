import { describe, expect, it } from 'vitest';
import { DailyVideoError, DailyVideoProvider } from './daily-provider.js';
import { MockVideoProvider } from './provider.js';

/**
 * Daily 어댑터 — 네트워크 없이 보내는 요청 모양만 확인한다.
 * 특히 비공개·2인·녹화 없음은 개인정보·비용 정책이라 요청 본문에서 직접 확인한다.
 */

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

function fakeFetch(responses: Array<{ status?: number; json: unknown }>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    });
    const next = responses.shift() ?? { json: {} };
    const status = next.status ?? 200;
    return new Response(JSON.stringify(next.json), { status });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const EXP = new Date('2026-10-20T05:30:00.000Z');

describe('DailyVideoProvider', () => {
  it('비공개·2인·만료 시 퇴장, 녹화 필드는 보내지 않는다', async () => {
    const { calls, impl } = fakeFetch([
      { json: { name: 'dimol-s1', url: 'https://x.daily.co/dimol-s1' } },
    ]);
    const daily = new DailyVideoProvider({ apiKey: 'test-key', fetchImpl: impl });
    const room = await daily.createRoom('s1', EXP);

    expect(room).toEqual({ roomName: 'dimol-s1', url: 'https://x.daily.co/dimol-s1' });
    expect(calls[0].url).toBe('https://api.daily.co/v1/rooms');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers.authorization).toBe('Bearer test-key');
    expect(calls[0].body).toEqual({
      name: 'dimol-s1',
      privacy: 'private',
      properties: {
        exp: Math.floor(EXP.getTime() / 1000),
        max_participants: 2,
        eject_at_room_exp: true,
      },
    });
    expect(JSON.stringify(calls[0].body)).not.toContain('enable_recording');
  });

  it('입장 링크 — 업체만 방 주인, 토큰은 ?t= 로 붙인다', async () => {
    const { calls, impl } = fakeFetch([{ json: { token: 'tok.en' } }, { json: { token: 'abc' } }]);
    const daily = new DailyVideoProvider({ apiKey: 'k', fetchImpl: impl });
    const room = { roomName: 'dimol-s1', url: 'https://x.daily.co/dimol-s1' };

    const providerUrl = await daily.createJoinUrl(
      room,
      { userId: 'u-provider', displayName: '대한철거', role: 'PROVIDER' },
      EXP,
    );
    const requesterUrl = await daily.createJoinUrl(
      room,
      { userId: 'u-req', displayName: '배출자', role: 'REQUESTER' },
      EXP,
    );

    expect(providerUrl).toBe('https://x.daily.co/dimol-s1?t=tok.en');
    expect(requesterUrl).toBe('https://x.daily.co/dimol-s1?t=abc');
    expect(calls[0].url).toBe('https://api.daily.co/v1/meeting-tokens');
    expect(calls[0].body).toEqual({
      properties: {
        room_name: 'dimol-s1',
        exp: Math.floor(EXP.getTime() / 1000),
        user_name: '대한철거',
        user_id: 'u-provider',
        is_owner: true,
        eject_at_token_exp: true,
      },
    });
    expect((calls[1].body!.properties as Record<string, unknown>).is_owner).toBe(false);
  });

  it('방 삭제 — 이미 없으면(404) 조용히 넘어간다', async () => {
    const { calls, impl } = fakeFetch([{ status: 404, json: { error: 'not-found' } }]);
    const daily = new DailyVideoProvider({ apiKey: 'k', fetchImpl: impl });
    await expect(daily.deleteRoom('dimol-s1')).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ method: 'DELETE', url: 'https://api.daily.co/v1/rooms/dimol-s1' });
  });

  it('오류 응답은 본문을 싣지 않고 상태 코드만 알린다', async () => {
    const { impl } = fakeFetch([{ status: 401, json: { info: 'secret-ish detail' } }]);
    const daily = new DailyVideoProvider({ apiKey: 'k', fetchImpl: impl });
    const err = await daily.createRoom('s1', EXP).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DailyVideoError);
    expect((err as Error).message).toContain('401');
    expect((err as Error).message).not.toContain('secret');
  });
});

describe('MockVideoProvider', () => {
  it('실재하지 않는 도메인(.invalid)을 돌려준다 — 진짜처럼 보이면 안 된다', async () => {
    const mock = new MockVideoProvider();
    expect(mock.kind).toBe('MOCK');
    const room = await mock.createRoom('s1');
    const url = await mock.createJoinUrl(room, { userId: 'u', displayName: 'x', role: 'REQUESTER' });
    expect(new URL(url).hostname.endsWith('.invalid')).toBe(true);
  });
});
