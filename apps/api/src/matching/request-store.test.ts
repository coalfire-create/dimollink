import { SITE_PHOTOS_MAX_PER_REQUEST } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { buildSitePhotoKey } from '../storage/site-photo.js';
import { MatchRequestStore, MatchRequestValidationError } from './request-store.js';

const baseInput = {
  dischargerId: 'discharger-1',
  region: '양평',
  wasteCategory: 'CONSTRUCTION' as const,
  wasteTons: 7,
  allbaroRequested: true,
};

function photoKeys(n: number): string[] {
  return Array.from({ length: n }, () => buildSitePhotoKey('DEMOLITION_REQUEST', 'image/jpeg'));
}

describe('MatchRequestStore.create — 현장 사진 연결', () => {
  it('업로드된 사진 키가 매칭요청에 저장된다', () => {
    const store = new MatchRequestStore();
    const keys = photoKeys(3);
    const request = store.create({ ...baseInput, sitePhotoKeys: keys });
    expect(request.sitePhotoKeys).toEqual(keys);
    expect(store.get(request.id)?.sitePhotoKeys).toEqual(keys);
  });

  it('사진 없이도 생성 가능 (빈 배열로 정규화)', () => {
    const store = new MatchRequestStore();
    expect(store.create(baseInput).sitePhotoKeys).toEqual([]);
  });

  it('중복 키는 제거된다', () => {
    const store = new MatchRequestStore();
    const [key] = photoKeys(1);
    const request = store.create({ ...baseInput, sitePhotoKeys: [key, key] });
    expect(request.sitePhotoKeys).toEqual([key]);
  });

  it(`최대 ${SITE_PHOTOS_MAX_PER_REQUEST}장 초과 거부`, () => {
    const store = new MatchRequestStore();
    expect(() =>
      store.create({ ...baseInput, sitePhotoKeys: photoKeys(SITE_PHOTOS_MAX_PER_REQUEST + 1) }),
    ).toThrow(MatchRequestValidationError);
  });

  it('서버 발급 형식이 아닌 키(외부 URL 등) 거부', () => {
    const store = new MatchRequestStore();
    expect(() =>
      store.create({ ...baseInput, sitePhotoKeys: ['https://evil.example/x.jpg'] }),
    ).toThrow(MatchRequestValidationError);
  });
});

describe('MatchRequestStore.create — 파일럿 범위·기본 검증', () => {
  it('양평 외 지역 거부 (파일럿 한정)', () => {
    const store = new MatchRequestStore();
    expect(() => store.create({ ...baseInput, region: '서울' })).toThrow(
      MatchRequestValidationError,
    );
  });

  it('중량 0 이하 거부', () => {
    const store = new MatchRequestStore();
    expect(() => store.create({ ...baseInput, wasteTons: 0 })).toThrow(
      MatchRequestValidationError,
    );
  });

  it('생성 직후 상태는 REQUESTED', () => {
    const store = new MatchRequestStore();
    expect(store.create(baseInput).status).toBe('REQUESTED');
  });
});

describe('MatchRequestStore.attachSitePhotos — 사후 첨부', () => {
  it('기존 요청에 사진을 추가 연결한다', () => {
    const store = new MatchRequestStore();
    const initial = photoKeys(2);
    const request = store.create({ ...baseInput, sitePhotoKeys: initial });
    const extra = photoKeys(2);
    const updated = store.attachSitePhotos(request.id, extra);
    expect(updated.sitePhotoKeys).toEqual([...initial, ...extra]);
  });

  it('기존 + 추가 합산이 최대 장수를 넘으면 거부', () => {
    const store = new MatchRequestStore();
    const request = store.create({
      ...baseInput,
      sitePhotoKeys: photoKeys(SITE_PHOTOS_MAX_PER_REQUEST),
    });
    expect(() => store.attachSitePhotos(request.id, photoKeys(1))).toThrow(
      MatchRequestValidationError,
    );
  });

  it('없는 요청 id 는 오류', () => {
    const store = new MatchRequestStore();
    expect(() => store.attachSitePhotos('no-such-id', photoKeys(1))).toThrow(
      MatchRequestValidationError,
    );
  });
});
