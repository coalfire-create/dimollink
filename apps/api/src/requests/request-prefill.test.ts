import { describe, expect, it } from 'vitest';
import {
  MAX_PREFILL_ENCODED,
  MAX_PREFILL_KG,
  MAX_PREFILL_TEXT,
  decodeRequestPrefill,
  encodeRequestPrefill,
  parsePrefillFromUrl,
  type RequestPrefillPayload,
} from '@dimol/shared';

/**
 * 요청 폼 프리필 코덱 — **URL 에서 오는 값**이라 신뢰할 수 없다.
 * 사용자가 검토하고 제출하는 폼을 채울 뿐이지만, 이상한 값이 그럴듯한 숫자로
 * 폼에 앉으면 그대로 견적·정산까지 흘러간다. 그래서 경계를 테스트로 못 박는다.
 */

const SAMPLE: RequestPrefillPayload = {
  wasteItems: [
    { material: 'REINFORCED_CONCRETE', kg: 132_700 },
    { material: 'METAL', kg: 7900 },
  ],
  siteAddress: '경기도 양평군 양평읍 양평리 1',
  buildingType: '단독주택',
  floorAreaM2: 100,
  floorCount: 2,
  allbaroRequired: true,
};

describe('encode/decode 왕복', () => {
  it('보낸 값이 그대로 돌아온다', () => {
    expect(decodeRequestPrefill(encodeRequestPrefill(SAMPLE))).toEqual(SAMPLE);
  });

  it('한글 주소가 깨지지 않는다', () => {
    const decoded = decodeRequestPrefill(encodeRequestPrefill(SAMPLE));
    expect(decoded?.siteAddress).toBe('경기도 양평군 양평읍 양평리 1');
  });

  it('URL 에 실어도 길이 상한 안에 들어온다', () => {
    expect(encodeRequestPrefill(SAMPLE).length).toBeLessThan(MAX_PREFILL_ENCODED);
  });
});

describe('decode — 신뢰할 수 없는 입력', () => {
  it('깨진 값은 예외 대신 null', () => {
    for (const bad of ['', '%%%', 'null', '[]', '"x"', '{', undefined, null]) {
      expect(decodeRequestPrefill(bad)).toBeNull();
    }
  });

  it('분류표에 없는 자재 코드는 버린다', () => {
    const raw = encodeURIComponent(
      JSON.stringify({ wasteItems: [{ material: 'PLUTONIUM', kg: 100 }] }),
    );
    expect(decodeRequestPrefill(raw)).toBeNull();
  });

  it('음수·0·비유한·상한 초과 중량은 버린다', () => {
    for (const kg of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY, MAX_PREFILL_KG + 1]) {
      const raw = encodeURIComponent(
        JSON.stringify({ wasteItems: [{ material: 'WOOD', kg }] }),
      );
      expect(decodeRequestPrefill(raw)).toBeNull();
    }
  });

  it('모르는 필드는 통과시키지 않는다', () => {
    const raw = encodeURIComponent(
      JSON.stringify({
        wasteItems: [{ material: 'WOOD', kg: 100 }],
        requesterId: 'someone-else',
        status: 'COMPLETED',
        __proto__: { admin: true },
      }),
    );
    const decoded = decodeRequestPrefill(raw);
    expect(decoded).toEqual({ wasteItems: [{ material: 'WOOD', kg: 100 }] });
    expect(decoded).not.toHaveProperty('requesterId');
    expect(decoded).not.toHaveProperty('status');
  });

  it('같은 자재가 두 번 오면 하나만 남긴다', () => {
    const raw = encodeURIComponent(
      JSON.stringify({
        wasteItems: [
          { material: 'WOOD', kg: 100 },
          { material: 'WOOD', kg: 999 },
        ],
      }),
    );
    expect(decodeRequestPrefill(raw)?.wasteItems).toEqual([{ material: 'WOOD', kg: 100 }]);
  });

  it('너무 긴 값은 파싱하지 않는다', () => {
    expect(decodeRequestPrefill('a'.repeat(MAX_PREFILL_ENCODED + 1))).toBeNull();
  });

  it('자재가 하나도 안 남으면 null — 채울 게 없다', () => {
    expect(decodeRequestPrefill(encodeURIComponent(JSON.stringify({ wasteItems: [] })))).toBeNull();
  });

  it('긴 문자열은 잘라서 받는다', () => {
    // 한글은 percent-encoding 후 9배로 부푼다 — 300자면 길이 상한(4000) 안에 들어와
    // 자르기 규칙 자체를 볼 수 있다. 그보다 길면 파싱 전에 통째로 거부된다(위 테스트).
    const raw = encodeURIComponent(
      JSON.stringify({ wasteItems: [{ material: 'WOOD', kg: 1 }], siteAddress: '가'.repeat(300) }),
    );
    expect(decodeRequestPrefill(raw)?.siteAddress?.length).toBe(MAX_PREFILL_TEXT);
  });
});

describe('parsePrefillFromUrl — 웹 주소와 딥링크 둘 다', () => {
  const encoded = encodeRequestPrefill(SAMPLE);

  it('웹 주소에서 꺼낸다', () => {
    expect(parsePrefillFromUrl(`https://example.com/?prefill=${encoded}`)).toEqual(SAMPLE);
  });

  it('커스텀 스킴 딥링크에서 꺼낸다', () => {
    expect(parsePrefillFromUrl(`dimollink://request?prefill=${encoded}`)).toEqual(SAMPLE);
  });

  it('다른 파라미터와 섞여 있어도 꺼낸다', () => {
    expect(parsePrefillFromUrl(`https://x/?a=1&prefill=${encoded}&b=2`)).toEqual(SAMPLE);
  });

  it('프리필이 없으면 null', () => {
    expect(parsePrefillFromUrl('https://example.com/')).toBeNull();
    expect(parsePrefillFromUrl(null)).toBeNull();
  });
});
