import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { HttpSmsSender, SolapiSmsSender } from './sms-sender.js';

const config = {
  apiUrl: 'https://sms.example/send',
  apiKey: 'secret',
  sender: '15880000',
  timeoutMs: 1000,
};

describe('HttpSmsSender', () => {
  it('정규화된 번호·발신번호·코드로 POST 한다', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const sender = new HttpSmsSender(config, fetchFn);

    await sender.send('010-1234-5678', '654321');

    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(config.apiUrl);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toBe('01012345678');
    expect(body.from).toBe('15880000');
    expect(body.text).toContain('654321');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer secret' });
  });

  it('비정상 응답(status)이면 예외를 던진다', async () => {
    const fetchFn = vi.fn(async () => new Response('err', { status: 500 })) as unknown as typeof fetch;
    const sender = new HttpSmsSender(config, fetchFn);
    await expect(sender.send('01012345678', '000000')).rejects.toThrow();
  });
});

describe('SolapiSmsSender', () => {
  const solapiConfig = {
    apiKey: 'KEYABC',
    apiSecret: 'SECRETXYZ',
    sender: '029302266',
    timeoutMs: 1000,
  };
  // 결정적 서명 검증을 위해 date/salt 고정 주입.
  const fixedDate = new Date('2026-07-23T12:00:00.000Z');
  const deps = { now: () => fixedDate, salt: () => 'fixedsalt' };

  it('v4 send 엔드포인트에 message 래핑 바디로 POST 하고 HMAC 서명을 붙인다', async () => {
    const fetchFn = vi.fn(
      async () => new Response(JSON.stringify({ statusCode: '2000' }), { status: 200 }),
    ) as unknown as typeof fetch;
    const sender = new SolapiSmsSender(solapiConfig, fetchFn, deps);

    await sender.send('010-1234-5678', '654321');

    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.solapi.com/messages/v4/send');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.message.to).toBe('01012345678');
    expect(body.message.from).toBe('029302266');
    expect(body.message.text).toContain('654321');

    const expectedSig = createHmac('sha256', 'SECRETXYZ')
      .update(fixedDate.toISOString() + 'fixedsalt')
      .digest('hex');
    const auth = (init as RequestInit).headers as Record<string, string>;
    expect(auth.Authorization).toContain('HMAC-SHA256 apiKey=KEYABC');
    expect(auth.Authorization).toContain('salt=fixedsalt');
    expect(auth.Authorization).toContain(`signature=${expectedSig}`);
    // apiSecret 원문은 절대 전송되지 않는다.
    expect(auth.Authorization).not.toContain('SECRETXYZ');
  });

  it('HTTP 200 이라도 statusCode 가 2xxx 가 아니면 예외를 던진다(접수 거부)', async () => {
    const fetchFn = vi.fn(
      async () => new Response(JSON.stringify({ statusCode: '4004' }), { status: 200 }),
    ) as unknown as typeof fetch;
    const sender = new SolapiSmsSender(solapiConfig, fetchFn, deps);
    await expect(sender.send('01012345678', '000000')).rejects.toThrow();
  });

  it('HTTP 실패(status)면 예외를 던진다', async () => {
    const fetchFn = vi.fn(async () => new Response('err', { status: 401 })) as unknown as typeof fetch;
    const sender = new SolapiSmsSender(solapiConfig, fetchFn, deps);
    await expect(sender.send('01012345678', '000000')).rejects.toThrow();
  });
});
