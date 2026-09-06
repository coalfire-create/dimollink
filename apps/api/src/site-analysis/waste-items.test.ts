import {
  DEFAULT_PHOTO_MATERIAL_KG,
  siteAnalysisToWasteItems,
  wasteItemsTotalKg,
  type DetectedMaterial,
} from '@dimol/shared';
import { describe, expect, it } from 'vitest';

function material(
  category: DetectedMaterial['category'],
  estimatedRatio?: number,
): DetectedMaterial {
  return {
    category,
    name: category,
    confidence: 'MEDIUM',
    recyclable: true,
    hazardous: false,
    estimatedRatio,
  };
}

function kgOf(items: ReturnType<typeof siteAnalysisToWasteItems>, code: string): number {
  return items.find((i) => i.material === code)?.kg ?? 0;
}

describe('siteAnalysisToWasteItems — 사진 소재 → 요청 항목', () => {
  it('총 중량을 성상 구성비로 나눈다 — 균등 분배가 아니다', () => {
    const items = siteAnalysisToWasteItems([material('CONCRETE'), material('GLASS')], 100_000, 'RC');
    const concrete = kgOf(items, 'REINFORCED_CONCRETE');
    const glass = kgOf(items, 'GLASS');

    // 예전 구현은 둘 다 50,000kg 였다. 콘크리트가 유리보다 압도적으로 커야 한다.
    expect(concrete).toBeGreaterThan(glass * 20);
    expect(concrete).toBeGreaterThan(70_000);
  });

  it('항목 합계가 총 중량과 정확히 일치한다(반올림 오차 보정)', () => {
    for (const total of [100_000, 33_333, 7, 1_234_567]) {
      const items = siteAnalysisToWasteItems([material('CONCRETE')], total, 'RC');
      expect(wasteItemsTotalKg(items)).toBe(Math.round(total));
    }
  });

  it('사진에 안 보여도 구조상 나오는 소재는 표가 지켜준다', () => {
    // 목조 주택 내부만 찍어 목재만 인식된 경우 — 기초 콘크리트가 빠지면 안 된다.
    const items = siteAnalysisToWasteItems([material('WOOD')], 50_000, 'WOOD');
    expect(kgOf(items, 'WOOD')).toBeGreaterThan(0);
    expect(kgOf(items, 'PLAIN_CONCRETE')).toBeGreaterThan(0);
  });

  it('구조에 따라 주 성상이 달라진다', () => {
    const rc = siteAnalysisToWasteItems([material('CONCRETE')], 100_000, 'RC');
    const brick = siteAnalysisToWasteItems([material('BRICK')], 100_000, 'BRICK');
    expect(kgOf(rc, 'REINFORCED_CONCRETE')).toBeGreaterThan(kgOf(rc, 'BRICK_MASONRY'));
    expect(kgOf(brick, 'BRICK_MASONRY')).toBeGreaterThan(kgOf(brick, 'PLAIN_CONCRETE'));
  });

  it('표에 없지만 사진에서 확인된 소재는 항목으로 편입된다(슬레이트 지붕)', () => {
    const items = siteAnalysisToWasteItems(
      [material('CONCRETE'), material('ROOFING')],
      100_000,
      'RC',
    );
    expect(kgOf(items, 'ROOFING_SLATE')).toBeGreaterThan(0);
  });

  it('모델의 과장된 구성비 힌트는 클램프된다', () => {
    // "유리가 전체의 60%" 같은 출력이 그대로 통과하면 안 된다(마감재 과대평가).
    const items = siteAnalysisToWasteItems(
      [material('CONCRETE', 20), material('GLASS', 60)],
      100_000,
      'RC',
    );
    expect(kgOf(items, 'GLASS')).toBeLessThan(10_000);
    expect(kgOf(items, 'REINFORCED_CONCRETE')).toBeGreaterThan(kgOf(items, 'GLASS'));
  });

  it('힌트는 클램프 범위 안에서 실제로 비율을 움직인다', () => {
    const base = siteAnalysisToWasteItems([material('CONCRETE'), material('WOOD')], 100_000, 'RC');
    const woodHeavy = siteAnalysisToWasteItems(
      [material('CONCRETE'), material('WOOD', 40)],
      100_000,
      'RC',
    );
    expect(kgOf(woodHeavy, 'WOOD')).toBeGreaterThan(kgOf(base, 'WOOD'));
  });

  it('구조를 모르면 기본 구조(RC)로 나눈다', () => {
    const items = siteAnalysisToWasteItems([material('CONCRETE')], 100_000);
    expect(kgOf(items, 'REINFORCED_CONCRETE')).toBeGreaterThan(70_000);
  });

  it('총 중량이 없으면 자리표시값만 준다(숫자를 지어내지 않는다)', () => {
    const items = siteAnalysisToWasteItems([material('BRICK'), material('WOOD')]);
    expect(items).toHaveLength(2);
    for (const item of items) expect(item.kg).toBe(DEFAULT_PHOTO_MATERIAL_KG);
  });

  it('타일(TILE) 카테고리가 SANITARY_TILE 코드로 정상 매핑된다', () => {
    const items = siteAnalysisToWasteItems([material('TILE')], 100_000, 'RC');
    expect(kgOf(items, 'SANITARY_TILE')).toBeGreaterThan(0);
  });

  it('식별 소재가 없으면 빈 배열', () => {
    expect(siteAnalysisToWasteItems([])).toEqual([]);
    expect(siteAnalysisToWasteItems([], 100_000, 'RC')).toEqual([]);
  });
});
