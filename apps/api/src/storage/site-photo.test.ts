import { SITE_PHOTO_MAX_BYTES, isValidSitePhotoKey } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { buildSitePhotoKey, validatePresignInput } from './site-photo.js';

describe('validatePresignInput', () => {
  const valid = {
    purpose: 'DEMOLITION_REQUEST',
    contentType: 'image/jpeg',
    contentLength: 1024,
  };

  it('정상 요청 통과', () => {
    const r = validatePresignInput(valid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.purpose).toBe('DEMOLITION_REQUEST');
  });

  it('처리장예약(DISPOSAL_RESERVATION) purpose 통과', () => {
    expect(validatePresignInput({ ...valid, purpose: 'DISPOSAL_RESERVATION' }).ok).toBe(true);
  });

  it('알 수 없는 purpose 거부', () => {
    expect(validatePresignInput({ ...valid, purpose: 'PROFILE' }).ok).toBe(false);
  });

  it('이미지 외 형식 거부 (pdf, svg 등)', () => {
    expect(validatePresignInput({ ...valid, contentType: 'application/pdf' }).ok).toBe(false);
    expect(validatePresignInput({ ...valid, contentType: 'image/svg+xml' }).ok).toBe(false);
  });

  it('최대 크기(10MB) 초과 거부, 경계값 통과', () => {
    expect(validatePresignInput({ ...valid, contentLength: SITE_PHOTO_MAX_BYTES }).ok).toBe(true);
    expect(validatePresignInput({ ...valid, contentLength: SITE_PHOTO_MAX_BYTES + 1 }).ok).toBe(
      false,
    );
  });

  it('contentLength 누락/0/음수/소수 거부', () => {
    for (const contentLength of [undefined, 0, -1, 1.5, '1024']) {
      expect(validatePresignInput({ ...valid, contentLength }).ok).toBe(false);
    }
  });

  it('본문 자체가 없으면 거부', () => {
    expect(validatePresignInput(null).ok).toBe(false);
    expect(validatePresignInput(undefined).ok).toBe(false);
  });
});

describe('buildSitePhotoKey', () => {
  it('발급 키는 공통 형식 검증(isValidSitePhotoKey)을 통과한다', () => {
    const key = buildSitePhotoKey('DEMOLITION_REQUEST', 'image/jpeg');
    expect(key.startsWith('site-photos/demolition-request/')).toBe(true);
    expect(key.endsWith('.jpg')).toBe(true);
    expect(isValidSitePhotoKey(key)).toBe(true);
  });

  it('purpose/형식별 경로·확장자 매핑', () => {
    const key = buildSitePhotoKey('DISPOSAL_RESERVATION', 'image/heic');
    expect(key.startsWith('site-photos/disposal-reservation/')).toBe(true);
    expect(key.endsWith('.heic')).toBe(true);
    expect(isValidSitePhotoKey(key)).toBe(true);
  });

  it('키에 UUID 외 식별정보가 없다 (PII 금지 규칙)', () => {
    const key = buildSitePhotoKey('DEMOLITION_REQUEST', 'image/png');
    // site-photos/<purpose>/<uuid>.<ext> 3단 구조 그대로인지.
    expect(key.split('/')).toHaveLength(3);
  });

  it('호출마다 서로 다른 키를 발급한다', () => {
    const a = buildSitePhotoKey('DEMOLITION_REQUEST', 'image/jpeg');
    const b = buildSitePhotoKey('DEMOLITION_REQUEST', 'image/jpeg');
    expect(a).not.toBe(b);
  });
});

describe('isValidSitePhotoKey (외부 입력 차단)', () => {
  it('외부 URL·임의 경로·경로조작 거부', () => {
    for (const bad of [
      'https://evil.example/x.jpg',
      'site-photos/demolition-request/../secret.jpg',
      'site-photos/other/00000000-0000-0000-0000-000000000000.jpg',
      'site-photos/demolition-request/not-a-uuid.jpg',
      'site-photos/demolition-request/00000000-0000-0000-0000-000000000000.exe',
      '',
    ]) {
      expect(isValidSitePhotoKey(bad)).toBe(false);
    }
  });
});
