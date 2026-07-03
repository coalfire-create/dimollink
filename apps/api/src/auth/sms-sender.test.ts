import { describe, expect, it, vi } from 'vitest';
import { HttpSmsSender } from './sms-sender.js';

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
