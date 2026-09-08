import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createContext, runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { parsePrefillFromUrl } from '@dimol/shared';

/**
 * 디몰비전 웹이 만드는 링크를 디몰링크가 **실제로 읽을 수 있는지** 확인한다.
 *
 * 두 서비스는 배포도 언어도 갈라져 있어서(정적 JS ↔ TS), 한쪽 형식만 바꿔도
 * 링크가 조용히 무시된다 — 버튼은 눌리는데 폼이 안 채워지는, 제일 알아채기 어려운
 * 종류의 고장이다. 그래서 만든 링크를 그대로 파서에 먹여 왕복으로 확인한다.
 */

const PREFILL_JS = readFileSync(
  fileURLToPath(new URL('../../../vision-web/lib/prefill.js', import.meta.url)),
  'utf-8',
);

function loadWebPrefill() {
  const sandbox = {
    window: { DimolVision: { config: { dimollinkWebUrl: 'https://dimollink.example' } } },
  };
  runInNewContext(PREFILL_JS, createContext(sandbox));
  return (sandbox.window.DimolVision as Record<string, unknown>) as {
    buildPrefillUrl: (report: unknown, meta?: unknown) => string | null;
  };
}

/** 실제 리포트와 같은 모양(vision-report.ts 의 VisionReport). */
const REPORT = {
  waste_plan: {
    allbaro_manifest_required: true,
    allbaro_reason: '건설폐기물 5톤 이상',
    items: [
      {
        category: 'REINFORCED_CONCRETE',
        estimated_amount: { value_min: 120, value_max: 145, unit: 'ton' },
        disposal_method: '중간처리장 반입',
      },
      {
        category: 'METAL',
        estimated_amount: { value_min: 7.9, value_max: 7.9, unit: 'ton' },
        disposal_method: '고철 재활용',
      },
    ],
  },
};

describe('디몰비전 링크 → 디몰링크 프리필 왕복', () => {
  it('만든 링크를 디몰링크 파서가 읽는다', () => {
    const url = loadWebPrefill().buildPrefillUrl(REPORT, {
      siteAddress: '경기도 양평군 양평읍 양평리 1',
      buildingType: '단독주택',
      floorAreaM2: '100',
      floorCount: '2',
    });
    expect(url).toBeTruthy();

    const decoded = parsePrefillFromUrl(url);
    expect(decoded).toEqual({
      // 범위의 중앙값 × 1000. 최댓값을 쓰면 견적이 과대해진다.
      wasteItems: [
        { material: 'REINFORCED_CONCRETE', kg: 132_500 },
        { material: 'METAL', kg: 7900 },
      ],
      siteAddress: '경기도 양평군 양평읍 양평리 1',
      buildingType: '단독주택',
      floorAreaM2: 100,
      floorCount: 2,
      allbaroRequired: true,
    });
  });

  it('부가 정보 없이도 자재만으로 링크가 선다', () => {
    const url = loadWebPrefill().buildPrefillUrl(REPORT);
    expect(parsePrefillFromUrl(url)?.wasteItems).toHaveLength(2);
  });

  it('톤이 아닌 단위는 넘기지 않는다 — kg 로 바꿀 근거가 없다', () => {
    const url = loadWebPrefill().buildPrefillUrl({
      waste_plan: {
        items: [
          {
            category: 'GLASS',
            estimated_amount: { value_min: 3, value_max: 5, unit: 'm3' },
            disposal_method: 'x',
          },
        ],
      },
    });
    expect(url).toBeNull();
  });

  it('넘길 자재가 없으면 null — 빈 폼을 열지 않는다', () => {
    expect(loadWebPrefill().buildPrefillUrl({ waste_plan: { items: [] } })).toBeNull();
    expect(loadWebPrefill().buildPrefillUrl({})).toBeNull();
  });
});
