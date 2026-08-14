import { siteAnalysisToWasteItems, type DetectedMaterial } from '@dimol/shared';
import { describe, expect, it } from 'vitest';

function material(category: DetectedMaterial['category']): DetectedMaterial {
  return { category, name: category, confidence: 'MEDIUM', recyclable: true, hazardous: false };
}

describe('siteAnalysisToWasteItems — 사진 소재 → 요청 항목', () => {
  it('식별 소재를 VisionMaterialCode 로 매핑하고 중복은 합친다', () => {
    const items = siteAnalysisToWasteItems([
      material('CONCRETE'),
      material('STEEL'),
      material('CONCRETE'), // 중복 → 1건으로
    ]);
    const codes = items.map((i) => i.material);
    expect(codes).toContain('REINFORCED_CONCRETE');
    expect(codes).toContain('METAL');
    expect(codes).toHaveLength(2); // 콘크리트 중복 제거
  });

  it('총 중량(kg)이 있으면 소재 수로 균등 분배한다', () => {
    const items = siteAnalysisToWasteItems([material('CONCRETE'), material('WOOD')], 6000);
    expect(items).toHaveLength(2);
    expect(items[0].kg).toBe(3000);
    expect(items[1].kg).toBe(3000);
  });

  it('총 중량이 없으면 소재별 기본 중량으로 채운다', () => {
    const items = siteAnalysisToWasteItems([material('BRICK')]);
    expect(items).toHaveLength(1);
    expect(items[0].kg).toBe(500);
  });

  it('식별 소재가 없으면 빈 배열', () => {
    expect(siteAnalysisToWasteItems([])).toEqual([]);
  });
});
