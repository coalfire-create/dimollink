import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `hidden` 속성으로 숨기는 요소가 실제로 숨는지 확인한다.
 *
 * `hidden` 은 브라우저 기본 스타일의 `display:none` 이라, 작성자 CSS 가 그 클래스에
 * `display` 를 지정하면 **조용히 이긴다**. 촬영 화면(.camera-overlay)이 `display:flex`
 * 였던 탓에 첫 화면부터 온 페이지를 검게 덮었다 — 스크린샷을 열어보기 전까지 몰랐다.
 * 눈으로만 잡을 수 있는 실수라 규칙으로 못 박는다.
 */

const DIR = fileURLToPath(new URL('../../../vision-web/', import.meta.url));
const HTML = readFileSync(`${DIR}index.html`, 'utf-8');
const CSS = readFileSync(`${DIR}styles.css`, 'utf-8');

/**
 * `hidden` 속성을 달고 시작하는 요소들의 class 목록.
 * `aria-hidden` 은 제외한다 — 다른 속성이고, 걸리면 엉뚱한 클래스가 잡힌다.
 */
function hiddenElementClasses(): string[] {
  const classes = new Set<string>();
  for (const tag of HTML.match(/<[a-z][^>]*(?<![\w-])hidden(?![\w-])[^>]*>/g) ?? []) {
    const cls = /class="([^"]*)"/.exec(tag)?.[1] ?? '';
    for (const name of cls.split(/\s+/).filter(Boolean)) classes.add(name);
  }
  return [...classes];
}

/** 이 클래스 선택자에 display 를 지정하는 규칙이 있는가(`[hidden]` 규칙은 제외). */
function setsDisplay(className: string): boolean {
  const rule = new RegExp(`\\.${className}(?![\\w-])(?![^,{]*\\[hidden\\])[^{]*\\{([^}]*)\\}`, 'g');
  for (const match of CSS.matchAll(rule)) {
    if (/(^|;)\s*display\s*:/.test(match[1])) return true;
  }
  return false;
}

describe('디몰비전 웹 — hidden 속성이 실제로 숨기는가', () => {
  it('display 를 지정한 클래스는 [hidden] 규칙을 함께 둔다', () => {
    const offenders = hiddenElementClasses()
      .filter(setsDisplay)
      .filter((c) => !new RegExp(`\\.${c}(?![\\w-])[^{,]*\\[hidden\\]`).test(CSS))
      .filter((c) => !new RegExp(`\\.${c}\\[hidden\\]`).test(CSS));
    expect(offenders).toEqual([]);
  });

  it('촬영 화면은 처음에 숨어 있다', () => {
    // 이 페이지에서 가장 크게 덮는 요소라 개별로 한 번 더 못 박는다.
    expect(HTML).toMatch(/id="camera-overlay"[^>]*\bhidden\b/s);
    expect(CSS).toMatch(/\.camera-overlay\[hidden\]\s*\{[^}]*display:\s*none/);
  });
});
