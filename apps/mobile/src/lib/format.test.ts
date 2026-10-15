import { describe, expect, it } from 'vitest';
import { manwon } from './format';

describe('manwon', () => {
  it('만 원 단위로 반올림하고 천 단위 구분을 붙인다', () => {
    expect(manwon(12_340_000)).toBe('1,234만 원');
    expect(manwon(12_345_678)).toBe('1,235만 원');
  });
});
