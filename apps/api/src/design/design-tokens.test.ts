import {
  COLORS,
  FONT_SIZES,
  GLYPH_SIZES,
  SPACING,
  STATUS_COLORS,
  TAB_LABEL_FONT_SIZE,
  TOUCH,
  isValidSpacing,
} from '@dimol/shared';
import { describe, expect, it } from 'vitest';

// CLAUDE.md 디자인 기준을 회귀 테스트로 고정한다 — 토큰 값을 낮추는 변경을 잡아낸다.
//
// 이 파일은 **토큰 값**만 지킨다. 화면이 토큰을 안 쓰고 숫자·색을 직접 박아 넣는 것은
// 여기서 못 잡으므로, 그쪽은 eslint 의 no-restricted-syntax 규칙(eslint.config.mjs)이 막는다.
// 둘 다 있어야 규칙이 실제로 유지된다.

/** WCAG 상대 휘도. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** 두 색의 명암비(1~21). WCAG AA 본문 기준은 4.5:1. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;

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

  // 탭 라벨과 기호는 18px 하한의 유일한 예외다. 예외가 슬금슬금 커지지 않게 상한을 건다.
  it('탭 라벨은 16px 이상 — 본문보다 작은 유일한 텍스트', () => {
    expect(TAB_LABEL_FONT_SIZE).toBeGreaterThanOrEqual(16);
    expect(TAB_LABEL_FONT_SIZE).toBeLessThan(FONT_SIZES.body);
  });

  it('기호 크기는 읽는 글자가 아니므로 본문보다 작다', () => {
    for (const value of Object.values(GLYPH_SIZES)) {
      expect(value).toBeLessThan(FONT_SIZES.body);
      expect(value).toBeGreaterThanOrEqual(14);
    }
  });
});

describe('색 명암비 — WCAG AA(4.5:1)', () => {
  it('본문·보조 텍스트가 흰 배경에서 읽힌다', () => {
    expect(contrast(COLORS.text, COLORS.background)).toBeGreaterThanOrEqual(AA);
    expect(contrast(COLORS.textMuted, COLORS.background)).toBeGreaterThanOrEqual(AA);
    expect(contrast(COLORS.textMuted, COLORS.surface)).toBeGreaterThanOrEqual(AA);
  });

  it('주요 버튼(흰 글자 + 메인 배경)이 읽힌다', () => {
    expect(contrast(COLORS.background, COLORS.primary)).toBeGreaterThanOrEqual(AA);
  });

  it('상태 배지 글자가 자기 배경 위에서 읽힌다', () => {
    expect(contrast(STATUS_COLORS.success, STATUS_COLORS.successSoft)).toBeGreaterThanOrEqual(AA);
    expect(contrast(STATUS_COLORS.warning, STATUS_COLORS.warningSoft)).toBeGreaterThanOrEqual(AA);
    expect(contrast(COLORS.error, STATUS_COLORS.errorSoft)).toBeGreaterThanOrEqual(AA);
    expect(contrast(COLORS.primary, COLORS.primarySoft)).toBeGreaterThanOrEqual(AA);
  });
});
