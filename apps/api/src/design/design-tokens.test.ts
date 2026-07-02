import { FONT_SIZES, SPACING, TOUCH, isValidSpacing } from '@dimol/shared';
import { describe, expect, it } from 'vitest';

// CLAUDE.md 디자인 기준을 회귀 테스트로 고정한다 — 토큰 값을 낮추는 변경을 잡아낸다.
describe('접근성 디자인 토큰 — CLAUDE.md 기준 준수', () => {
  it('기본 텍스트 18px 이상, 제목 24px 이상', () => {
    expect(FONT_SIZES.caption).toBeGreaterThanOrEqual(18);
    expect(FONT_SIZES.body).toBeGreaterThanOrEqual(18);
    expect(FONT_SIZES.title).toBeGreaterThanOrEqual(24);
    expect(FONT_SIZES.titleLarge).toBeGreaterThanOrEqual(24);
  });

  it('버튼 높이 최소 48px', () => {
    expect(TOUCH.minButtonHeight).toBeGreaterThanOrEqual(48);
    expect(TOUCH.primaryButtonHeight).toBeGreaterThanOrEqual(48);
  });

  it('여백은 8px 배수만', () => {
    for (const value of Object.values(SPACING)) {
      expect(isValidSpacing(value)).toBe(true);
    }
    expect(isValidSpacing(12)).toBe(false);
    expect(isValidSpacing(-8)).toBe(false);
  });
});
