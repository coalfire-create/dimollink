import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 디몰비전 웹 접근성 — CLAUDE.md 디자인 기준을 CSS 에서 강제한다.
 *
 * 이 사이트는 공모전 제출물이자 고령 사용자를 상정한 화면이다. 토큰(`--fs-*`)을 두고도
 * 한 군데만 하드코딩하면 조용히 기준에서 벗어나는데(실제로 `.badge` 가 15px 였다),
 * 눈으로는 잘 안 보인다. 그래서 규칙을 테스트로 못 박는다.
 */

const CSS = readFileSync(
  fileURLToPath(new URL('../../../vision-web/styles.css', import.meta.url)),
  'utf-8',
);

/** CLAUDE.md: 기본 텍스트 18px 이상, 제목 24px 이상, 버튼 높이 48px 이상. */
const MIN_FONT_PX = 18;
const MIN_TOUCH_PX = 48;

describe('디몰비전 웹 CSS — CLAUDE.md 디자인 기준', () => {
  it('하드코딩된 글씨 크기가 18px 미만이면 안 된다', () => {
    // 토큰 정의(:root) 자체는 검사 대상에서 뺀다 — 거기가 단일 원천이다.
    const body = CSS.slice(CSS.indexOf('}', CSS.indexOf(':root')) + 1);
    const hardcoded = [...body.matchAll(/font-size:\s*(\d+)px/g)].map((m) => ({
      px: Number(m[1]),
      at: m[0],
    }));
    const tooSmall = hardcoded.filter((f) => f.px < MIN_FONT_PX);
    expect(tooSmall).toEqual([]);
  });

  it('폰트 토큰이 기준을 만족한다', () => {
    const tokens = Object.fromEntries(
      [...CSS.matchAll(/--fs-([a-z-]+):\s*(\d+)px/g)].map((m) => [m[1], Number(m[2])]),
    );
    expect(tokens.body).toBeGreaterThanOrEqual(MIN_FONT_PX);
    expect(tokens.title).toBeGreaterThanOrEqual(24);
  });

  it('여백 토큰은 8px 배수다', () => {
    const spacings = [...CSS.matchAll(/--sp-[a-z]+:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(spacings.length).toBeGreaterThan(0);
    for (const px of spacings) expect(px % 8).toBe(0);
  });

  it('버튼 높이 토큰이 48px 이상이다', () => {
    // 버튼은 토큰(--btn-h*)으로 높이를 잡는다. 토큰 값을 검사해야 실제 기준이 지켜진다.
    const tokens = [...CSS.matchAll(/--btn-h[a-z-]*:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(tokens.length).toBeGreaterThan(0);
    for (const px of tokens) expect(px).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
  });

  it('하드코딩된 min-height 가 있다면 그것도 48px 이상이어야 한다', () => {
    const hardcoded = [...CSS.matchAll(/min-height:\s*(\d+)px/g)].map((m) => Number(m[1]));
    for (const px of hardcoded) expect(px).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
  });
});
