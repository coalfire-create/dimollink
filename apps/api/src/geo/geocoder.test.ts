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

  /**
   * 역지오코딩 키가 없을 때의 폴백.
   * 예전에는 "경기 부근 · 위도 37.36134, 경도 127.10554" 처럼 좌표를 주소 문자열에
   * 끼워 넣었다. 화면에는 그게 주소로 보이고 그대로 현장 주소로 저장까지 됐다.
   */
  it('좌표를 주소 문자열에 끼워 넣지 않는다', async () => {
    const r = await new NoopGeocoder().reverseGeocode(37.36134, 127.10554);
    expect(r).not.toBeNull();
    expect(r!.roadAddressName).not.toMatch(/위도|경도|\d+\.\d{3}/);
    expect(r!.addressName).not.toMatch(/위도|경도|\d+\.\d{3}/);
  });

  it('확정된 주소가 아님을 approximate 로 표시하고 좌표는 location 에만 담는다', async () => {
    const r = await new NoopGeocoder().reverseGeocode(37.36134, 127.10554);
    expect(r!.approximate).toBe(true);
    expect(r!.location).toEqual({ lat: 37.36134, lng: 127.10554 });
    expect(r!.region).toBe('경기');
  });
});
