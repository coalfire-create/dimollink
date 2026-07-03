import { describe, expect, it } from 'vitest';
import {
  formatBusinessNumber,
  isValidBusinessNumber,
  isValidBusinessNumberChecksum,
  isValidBusinessNumberFormat,
  maskBusinessNumber,
  normalizeBusinessNumber,
} from '@dimol/shared';

// 실재하는 유효 체크섬 사업자등록번호(공개 값) — 220-81-62517.
const VALID = '2208162517';

describe('normalizeBusinessNumber', () => {
  it('하이픈/공백을 제거하고 숫자만 남긴다', () => {
    expect(normalizeBusinessNumber('220-81-62517')).toBe(VALID);
    expect(normalizeBusinessNumber(' 220 81 62517 ')).toBe(VALID);
  });
});

describe('isValidBusinessNumberFormat', () => {
  it('10자리 숫자면 통과, 그 외는 실패', () => {
    expect(isValidBusinessNumberFormat('220-81-62517')).toBe(true);
    expect(isValidBusinessNumberFormat('12345')).toBe(false);
    expect(isValidBusinessNumberFormat('12345678901')).toBe(false);
  });
});

describe('isValidBusinessNumberChecksum', () => {
  it('유효 체크섬은 통과', () => {
    expect(isValidBusinessNumberChecksum(VALID)).toBe(true);
  });

  it('체크섬이 틀리면 실패', () => {
    expect(isValidBusinessNumberChecksum('2208162518')).toBe(false);
  });

  it('형식이 아니면 실패', () => {
    expect(isValidBusinessNumberChecksum('220')).toBe(false);
  });
});

describe('isValidBusinessNumber', () => {
  it('형식+체크섬 모두 통과해야 유효', () => {
    expect(isValidBusinessNumber('220-81-62517')).toBe(true);
    expect(isValidBusinessNumber('2208162518')).toBe(false);
    expect(isValidBusinessNumber('abc')).toBe(false);
  });
});

describe('formatBusinessNumber', () => {
  it('표준 표기로 변환', () => {
    expect(formatBusinessNumber(VALID)).toBe('220-81-62517');
  });
});

describe('maskBusinessNumber', () => {
  it('뒤 5자리를 가린다 (PII 로그 보호)', () => {
    expect(maskBusinessNumber(VALID)).toBe('220-81-*****');
  });

  it('형식이 아니면 전체 마스킹', () => {
    expect(maskBusinessNumber('220')).toBe('***');
  });

  it('마스킹 결과에 원본 뒷자리가 남지 않는다', () => {
    expect(maskBusinessNumber(VALID)).not.toContain('62517');
  });
});
