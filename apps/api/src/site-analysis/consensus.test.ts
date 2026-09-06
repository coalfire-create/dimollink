import type { AnalyzeSiteInput, SiteAnalyzer } from './analyzer.js';
import { ConsensusSiteAnalyzer, mergeByVote, overallConfidence } from './consensus.js';
import {
  SITE_ANALYSIS_DISCLAIMER,
  type DetectedMaterial,
  type MaterialCategory,
  type SiteAnalysis,
} from '@dimol/shared';
import { describe, expect, it } from 'vitest';

const B64 = 'x'.repeat(200);

function material(category: MaterialCategory, confidence: 'LOW' | 'MEDIUM' | 'HIGH' = 'HIGH'): DetectedMaterial {
  return { category, name: category, confidence, recyclable: true, hazardous: false };
}

function analysis(materials: DetectedMaterial[]): SiteAnalysis {
  return {
    summary: 's',
    materials,
    demolitionSteps: [],
    hazards: [],
    coverageWarnings: [],
    method: 'AI_VISION',
    confidence: 'HIGH',
    disclaimer: SITE_ANALYSIS_DISCLAIMER,
    analyzedAt: new Date().toISOString(),
  };
}

/** 사진마다 다른 결과를 내는 가짜 분석기. 종합 호출(다중 이미지)은 첫 응답을 쓴다. */
class ScriptedAnalyzer implements SiteAnalyzer {
  calls = 0;
  constructor(private readonly perImage: MaterialCategory[][]) {}
  async analyze(input: AnalyzeSiteInput): Promise<SiteAnalysis> {
    this.calls += 1;
    const images = input.images ?? [];
    if (images.length !== 1) {
      // 종합 호출 — 모든 사진의 합집합을 본다고 가정.
      const union = Array.from(new Set(this.perImage.flat()));
      return analysis(union.map((c) => material(c)));
    }
    const index = Number(images[0]?.imageBase64.slice(0, 1)) || 0;
    return analysis((this.perImage[index] ?? []).map((c) => material(c)));
  }
}

function imagesFor(count: number) {
  return Array.from({ length: count }, (_, i) => ({ imageBase64: `${i}${B64}` }));
}

describe('ConsensusSiteAnalyzer — 사진 간 교차검증', () => {
  it('사진 1장이면 추가 호출 없이 그대로 위임한다', async () => {
    const inner = new ScriptedAnalyzer([['CONCRETE']]);
    const result = await new ConsensusSiteAnalyzer(inner).analyze({ imageBase64: B64 });
    expect(inner.calls).toBe(1);
    expect(result.materials).toHaveLength(1);
  });

  it('꺼져 있으면 종합 1회만 호출한다', async () => {
    const inner = new ScriptedAnalyzer([['CONCRETE'], ['CONCRETE']]);
    await new ConsensusSiteAnalyzer(inner, false).analyze({ images: imagesFor(2) });
    expect(inner.calls).toBe(1);
  });

  it('사진 수 + 1회 호출한다(종합 1 + 장당 N)', async () => {
    const inner = new ScriptedAnalyzer([['CONCRETE'], ['CONCRETE'], ['CONCRETE']]);
    await new ConsensusSiteAnalyzer(inner).analyze({ images: imagesFor(3) });
    expect(inner.calls).toBe(4);
  });

  it('모든 사진에서 보인 소재는 HIGH, 한 장에서만 튄 소재는 LOW', async () => {
    const inner = new ScriptedAnalyzer([
      ['CONCRETE', 'STEEL'],
      ['CONCRETE'],
      ['CONCRETE'],
      ['CONCRETE'],
    ]);
    const result = await new ConsensusSiteAnalyzer(inner).analyze({ images: imagesFor(4) });

    const concrete = result.materials.find((m) => m.category === 'CONCRETE');
    const steel = result.materials.find((m) => m.category === 'STEEL');
    expect(concrete?.confidence).toBe('HIGH');
    expect(concrete?.detectedIn).toBe(4);
    // 4장 중 1장 = 0.25 → LOW. 모델이 스스로 HIGH 라 했어도 덮어쓴다.
    expect(steel?.confidence).toBe('LOW');
    expect(steel?.detectedIn).toBe(1);
  });

  it('일부 사진 분석이 실패해도 나머지 표로 진행한다', async () => {
    class FlakyAnalyzer implements SiteAnalyzer {
      calls = 0;
      async analyze(input: AnalyzeSiteInput): Promise<SiteAnalysis> {
        this.calls += 1;
        if ((input.images ?? []).length === 1 && this.calls % 2 === 0) {
          throw new Error('일시 오류');
        }
        return analysis([material('CONCRETE')]);
      }
    }
    const result = await new ConsensusSiteAnalyzer(new FlakyAnalyzer()).analyze({
      images: imagesFor(4),
    });
    expect(result.materials.length).toBeGreaterThan(0);
  });
});

describe('mergeByVote', () => {
  it('종합 분석이 놓친 소재도 장당 분석에서 주워온다', () => {
    const merged = mergeByVote([material('CONCRETE')], [analysis([material('WOOD')])], 1);
    expect(merged.map((m) => m.category).sort()).toEqual(['CONCRETE', 'WOOD']);
  });

  it('같은 사진에서 같은 소재가 두 번 나와도 1표다', () => {
    const merged = mergeByVote(
      [],
      [analysis([material('CONCRETE'), material('CONCRETE')])],
      1,
    );
    expect(merged[0]?.detectedIn).toBe(1);
  });

  it('검출 횟수가 많은 순으로 정렬한다', () => {
    const merged = mergeByVote(
      [],
      [analysis([material('WOOD')]), analysis([material('WOOD'), material('GLASS')])],
      2,
    );
    expect(merged[0]?.category).toBe('WOOD');
  });
});

describe('overallConfidence', () => {
  it('사진이 적으면 무엇을 봤든 확신하지 않는다', () => {
    expect(overallConfidence([{ ...material('CONCRETE'), confidence: 'HIGH' }], 1)).toBe('LOW');
    expect(overallConfidence([], 6)).toBe('LOW');
  });

  it('사진이 충분하고 합의된 소재가 있으면 HIGH', () => {
    expect(overallConfidence([{ ...material('CONCRETE'), confidence: 'HIGH' }], 4)).toBe('HIGH');
  });
});
