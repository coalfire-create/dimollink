import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { securityHeaders } from '../middleware/security.js';
import { createMapPageRouter, renderMapPage } from './map-page.js';

/**
 * 지도 페이지 — 앱이 iframe/WebView 로 띄우는 실제 문서.
 * 카카오 SDK 가 `location.protocol` 을 보기 때문에 이 문서는 반드시 실제 URL 로 서빙돼야
 * 하고(srcDoc 금지), 키가 없거나 SDK 가 실패해도 지도가 비지 않아야 한다.
 */

const CENTER = { lat: 37.4912, lng: 127.4875 };

describe('renderMapPage — 카카오 키 있을 때', () => {
  const html = renderMapPage('testkey123', CENTER);

  it('카카오 SDK 를 https 로 불러온다(Mixed Content 방지)', () => {
    expect(html).toContain('https://dapi.kakao.com/v2/maps/sdk.js');
    expect(html).not.toContain('http://dapi.kakao.com');
  });

  it('키를 URL 인코딩해 넣는다', () => {
    expect(renderMapPage('a b+c', CENTER)).toContain('appkey=a%20b%2Bc');
  });

  it('전달받은 중심 좌표로 지도를 만든다', () => {
    expect(html).toContain('37.4912');
    expect(html).toContain('127.4875');
  });

  it('SDK 가 뜨지 않을 때를 대비해 OSM 폴백을 함께 심는다', () => {
    expect(html).toContain('tile.openstreetmap.org');
    expect(html).toContain('startOsm');
    // 카카오가 성공하면 폴백이 덮어쓰지 않아야 한다.
    expect(html).toContain('if (mapApi) return;');
  });

  it('CARTO 타일은 쓰지 않는다(무료 티어 워터마크)', () => {
    expect(html).not.toContain('cartocdn');
  });
});

describe('renderMapPage — 키 없을 때', () => {
  const html = renderMapPage(null, CENTER);

  it('카카오 SDK 를 아예 부르지 않는다', () => {
    expect(html).not.toContain('dapi.kakao.com');
  });

  it('OSM 으로 바로 시작하고 사용자에게 상황을 알린다', () => {
    expect(html).toContain('tile.openstreetmap.org');
    expect(html).toContain('간략 모드');
  });

  // 지도 안내 문구는 최종 사용자가 읽는 텍스트다. 연동사 이름이나 키·도메인 설정 같은
  // 내부 사정을 노출하면 사용자는 자기가 뭘 잘못했나 싶어진다.
  it('안내 문구에 내부 사정(연동사·키)을 노출하지 않는다', () => {
    const notes = [...html.matchAll(/startOsm\('([^']*)'\)/g)].map((m) => m[1]);
    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) {
      expect(note).not.toMatch(/카카오|kakao|키|도메인|API/i);
    }
  });
});

/**
 * 핀 연출 — "지도를 움직이는 동안 떠 있다가, 멈추면 내려앉는다"가 핵심이다.
 * 상시 반복 애니메이션이나 이모지 핀은 통제가 안 되고 싸구려로 보인다.
 */
describe('renderMapPage — 핀 연출', () => {
  const html = renderMapPage('k', CENTER);

  it('핀을 이모지가 아니라 SVG 로 그린다', () => {
    expect(html).toContain('<svg');
    expect(html).not.toContain('📍');
  });

  it('핀 끝이 지도 정중앙에 정렬된다', () => {
    expect(html).toContain('.pin-anchor { position:absolute; left:50%; top:50%;');
    expect(html).toContain('.pin-body { position:absolute; bottom:0;');
  });

  it('움직이는 동안에만 핀이 떠오른다(상시 반복 애니메이션 없음)', () => {
    expect(html).toContain('.pin-anchor.is-moving .pin-body');
    expect(html).not.toContain('infinite');
  });

  it('그림자가 줄어들며 핀의 높이를 표현한다', () => {
    expect(html).toContain('.pin-anchor.is-moving .pin-shadow');
    expect(html).toContain('transform:scale(.5)');
  });

  // 그림자 위에 별도의 점을 겹쳐 그리면 축소된 그림자를 덮어 높이 단서가 사라진다.
  it('그림자를 가리는 중복 지점 표시를 두지 않는다', () => {
    expect(html).not.toContain('pin-dot');
  });

  it('이동 시작을 앱에 알려 주소 텍스트를 흐리게 할 수 있게 한다', () => {
    expect(html).toContain("type: 'MAP_MOVING'");
  });

  // 이동 종료 이벤트가 유실되면 핀이 뜬 채로 굳고 확정 버튼이 영영 비활성이 된다.
  it('이동 종료 이벤트가 오지 않아도 스스로 원위치한다', () => {
    expect(html).toContain('settleGuard');
    expect(html).toContain('markSettled(); scheduleMoved();');
  });
});

/**
 * 지도 위 컨트롤 — 고령 사용자 기준 터치 영역 48px 을 지킨다(CLAUDE.md 디자인 기준).
 */
describe('renderMapPage — 지도 컨트롤', () => {
  const html = renderMapPage('k', CENTER);

  it('현재 위치·확대·축소 버튼을 제공한다', () => {
    expect(html).toContain('id="btn-locate"');
    expect(html).toContain('id="btn-zoom-in"');
    expect(html).toContain('id="btn-zoom-out"');
  });

  it('모든 지도 버튼이 48px 터치 영역을 지킨다', () => {
    expect(html).toContain('.map-btn { width:48px; height:48px;');
  });

  it('버튼마다 접근성 레이블을 단다', () => {
    expect(html).toContain('aria-label="현재 위치로 이동"');
    expect(html).toContain('aria-label="확대"');
    expect(html).toContain('aria-label="축소"');
  });

  it('지도 기본 줌 컨트롤과 겹치지 않게 숨긴다', () => {
    expect(html).toContain('.leaflet-control-zoom, .leaflet-control-attribution { display:none !important; }');
  });
});

describe('renderMapPage — 앱과의 통신 규약', () => {
  const html = renderMapPage('k', CENTER);

  it('앱이 지도를 옮길 수 있는 __panTo 를 노출한다', () => {
    expect(html).toContain('window.__panTo');
  });

  it('지도가 준비되기 전 이동 요청도 잃지 않는다', () => {
    expect(html).toContain('pendingCenter');
  });

  it('이동 완료를 웹(iframe)·네이티브(WebView) 양쪽으로 알린다', () => {
    expect(html).toContain("window.parent.postMessage");
    expect(html).toContain('ReactNativeWebView.postMessage');
    expect(html).toContain("type: 'MAP_MOVED'");
  });

  it('PAN_TO 메시지를 수신한다', () => {
    expect(html).toContain("e.data.type === 'PAN_TO'");
  });
});


/**
 * 전역 보안 헤더(X-Frame-Options: DENY)가 걸린 앱에서 이 문서만 iframe 으로 떠야 한다.
 * 헤더를 되돌리지 않으면 지도 자리가 통째로 빈 화면이 된다.
 */
describe('GET /map — 프레이밍 허용', () => {
  let server: Server;
  let base: string;

  beforeEach(async () => {
    const app = express();
    app.use(securityHeaders(false)); // 실제 앱과 동일하게 전역 보안 헤더를 먼저 건다
    app.use('/', createMapPageRouter());
    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('동일 출처 프레이밍을 허용한다(전역 DENY 를 덮어씀)', async () => {
    const res = await fetch(`${base}/map`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
  });

  it('타일 등 외부 리소스를 받을 수 있게 리소스 정책을 푼다', async () => {
    const res = await fetch(`${base}/map`);
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  });

  it('쿼리로 받은 좌표를 중심으로 쓴다', async () => {
    const html = await (await fetch(`${base}/map?lat=35.1587&lng=129.1604`)).text();
    expect(html).toContain('35.1587');
    expect(html).toContain('129.1604');
  });

  it('좌표가 없거나 잘못되면 기본 좌표로 뜬다(빈 지도 방지)', async () => {
    const html = await (await fetch(`${base}/map?lat=abc`)).text();
    expect(html).toContain('37.5665');
  });
});
