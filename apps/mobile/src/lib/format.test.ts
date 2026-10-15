import { describe, expect, it } from 'vitest';
import { manwon, amountReadout } from './format';

describe('manwon', () => {
  it('만 원 단위로 반올림하고 천 단위 구분을 붙인다', () => {
    expect(manwon(12_340_000)).toBe('1,234만 원');
    expect(manwon(12_345_678)).toBe('1,235만 원');
  });
});

describe('amountReadout', () => {
  it('만 원 단위로 읽어 준다', () => {
    expect(amountReadout('8000000')).toBe('800만 원');
    expect(amountReadout('12000000')).toBe('1,200만 원');
  });

  it('반올림하지 않는다 — 내는 금액은 한 원까지 그대로', () => {
    expect(amountReadout('12345678')).toBe('1,234만 5,678원');
  });

  it('만 원 미만은 원 단위로', () => {
    expect(amountReadout('5000')).toBe('5,000원');
  });

  it('쉼표·공백이 섞여도 읽고, 숫자가 아니거나 0이면 비운다', () => {
    expect(amountReadout('1,000,000')).toBe('100만 원');
    expect(amountReadout('')).toBeUndefined();
    expect(amountReadout('abc')).toBeUndefined();
    expect(amountReadout('0')).toBeUndefined();
  });
});
