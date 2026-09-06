import { describe, expect, it } from 'vitest';
import { escapeForJs, renderScanViewerPage } from './scan-viewer-page.js';

describe('escapeForJs — 장면 URL 주입 차단', () => {
  it('따옴표와 태그 문자를 무해화한다', () => {
    const escaped = escapeForJs(`"</script><script>alert('x')</script>`);
    expect(escaped).not.toContain('</script>');
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
  });

  it('개행을 제거한다(문자열 리터럴이 깨지지 않게)', () => {
    expect(escapeForJs('a\nb\r\nc')).toBe('abc');
  });

  it('역슬래시를 이스케이프한다', () => {
    expect(escapeForJs('a\\b')).toBe('a\\\\b');
  });
});

describe('renderScanViewerPage', () => {
  it('정상 URL 을 스크립트에 담는다', () => {
    const html = renderScanViewerPage('https://cdn.example.com/scene.ply');
    expect(html).toContain('https://cdn.example.com/scene.ply');
    expect(html).toContain('<canvas id="canvas">');
  });

  it('주입 시도가 스크립트 블록을 탈출하지 못한다', () => {
    const html = renderScanViewerPage(`x"</script><script>alert(1)</script>`);
    // 문서에 원래 있는 script 태그(importmap + module) 외에 새 태그가 생기면 안 된다.
    // (문자열 리터럴 안에 남는 텍스트 자체는 데이터라 무해하다 — 탈출 여부만이 문제다.)
    expect(html.match(/<script/g) ?? []).toHaveLength(2);
    expect(html.match(/<\/script>/g) ?? []).toHaveLength(2);
    // 페이로드는 이스케이프된 형태로만 남는다.
    expect(html).toContain('\\u003c/script\\u003e');
    // 문자열을 닫는 따옴표도 이스케이프돼 있어야 한다.
    expect(html).toContain('var SCENE_URL = "x\\"');
  });

  it('장면이 없어도 상태 안내를 보여준다(복원 중은 정상 상태)', () => {
    const html = renderScanViewerPage('');
    expect(html).toContain('3D 복원을 준비하고 있어요');
    expect(html).toContain('20~40분');
  });

  it('WebGL 미지원 기기용 대체 문구가 있다', () => {
    expect(renderScanViewerPage('')).toContain('이 기기에서는 3D를 볼 수 없어요');
  });

  it('뷰어 로드·장면 로드 실패를 모두 잡는다', () => {
    const html = renderScanViewerPage('https://x/scene.ply');
    expect(html).toContain('.catch(');
    expect(html).toContain('3D 뷰어를 불러오지 못했어요');
    expect(html).toContain('장면을 여는 데 실패했어요');
  });

  it('UMD(.cjs) 대신 ESM 을 쓴다 — jsDelivr 가 .cjs 를 스크립트로 서빙하지 않는다', () => {
    const html = renderScanViewerPage('https://x/scene.ply');
    expect(html).toContain('gaussian-splats-3d.module.js');
    expect(html).not.toContain('.umd.cjs');
    // three 는 importmap 으로 매핑돼야 라이브러리의 import 가 풀린다.
    expect(html).toContain('type="importmap"');
    expect(html).toContain('three.module.js');
  });

  it('WebGL 지원 검사는 렌더 캔버스가 아닌 별도 캔버스로 한다', () => {
    // 렌더 캔버스에서 getContext 를 먼저 부르면 컨텍스트를 점유해 뷰어가 멈춘다.
    const html = renderScanViewerPage('https://x/scene.ply');
    expect(html).toContain("var probe = document.createElement('canvas')");
    expect(html).not.toMatch(/canvas\.getContext\('webgl2'\)/);
  });

  it('접근성 — 본문 18px·제목 24px 이상 (CLAUDE.md 고령 사용자 기준)', () => {
    const html = renderScanViewerPage('');
    const sizes = [...html.matchAll(/font(?:-size)?:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(18);
    // 제목은 24px 이상.
    expect(html).toMatch(/\.panel h1 \{ font-size: 2[4-9]px/);
  });

  it('접근성 — 버튼 터치 영역 48px 이상', () => {
    expect(renderScanViewerPage('')).toContain('min-height: 48px');
  });
});
