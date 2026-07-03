import { describe, expect, it, vi } from 'vitest';
import { KakaoGeocoder, NoopGeocoder } from './geocoder.js';

describe('KakaoGeocoder', () => {
  it('주소를 좌표(lat,lng)로 변환한다', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ documents: [{ x: '127.49', y: '37.49' }] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const geocoder = new KakaoGeocoder('restkey', 1000, fetchFn);

    const point = await geocoder.geocode('경기 양평군 양평읍');
    expect(point).toEqual({ lat: 37.49, lng: 127.49 });

    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('dapi.kakao.com');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'KakaoAK restkey' });
  });

  it('결과 없음/오류 시 null', async () => {
    const empty = vi.fn(
      async () => new Response(JSON.stringify({ documents: [] }), { status: 200 }),
    ) as unknown as typeof fetch;
    expect(await new KakaoGeocoder('k', 1000, empty).geocode('없는주소')).toBeNull();

    const err = vi.fn(async () => new Response('e', { status: 500 })) as unknown as typeof fetch;
    expect(await new KakaoGeocoder('k', 1000, err).geocode('주소')).toBeNull();
  });

  it('빈 주소는 호출 없이 null', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    expect(await new KakaoGeocoder('k', 1000, fetchFn).geocode('  ')).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('NoopGeocoder', () => {
  it('항상 null', async () => {
    expect(await new NoopGeocoder().geocode('아무주소')).toBeNull();
  });
});
