import {
  SITE_ANALYSIS_DISCLAIMER,
  type BuildingLedgerInfo,
  type DetectedMaterial,
  type SiteAnalysis,
} from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { LEDGER_ASBESTOS_HAZARD, applyLedgerConsistency } from './consistency.js';

function analysis(materials: DetectedMaterial[], hazards: string[] = []): SiteAnalysis {
  return {
    summary: 's',
    materials,
    demolitionSteps: [],
    hazards,
    coverageWarnings: [],
    method: 'AI_VISION',
    confidence: 'MEDIUM',
    disclaimer: SITE_ANALYSIS_DISCLAIMER,
    analyzedAt: new Date().toISOString(),
  };
}

const SLATE: DetectedMaterial = {
  category: 'ROOFING',
  name: '슬레이트 지붕(석면 의심)',
  confidence: 'HIGH',
  recyclable: false,
  hazardous: true,
};

const RC_2015: BuildingLedgerInfo = { strctCdNm: '철근콘크리트구조', useAprDay: '20150301' };
const BRICK_1985: BuildingLedgerInfo = { strctCdNm: '연와조', useAprDay: '19850301' };

describe('applyLedgerConsistency — 대장 정합성 강제', () => {
  it('대장 정보가 없으면 아무것도 바꾸지 않는다', () => {
    const input = analysis([SLATE]);
    const { analysis: out, applied } = applyLedgerConsistency(input, undefined);
    expect(out).toBe(input);
    expect(applied).toEqual([]);
  });

  it('금지연도 이후 건물의 석면 인식은 신뢰도를 낮추되 지우지는 않는다', () => {
    const { analysis: out } = applyLedgerConsistency(analysis([SLATE]), RC_2015);
    const slate = out.materials.find((m) => m.category === 'ROOFING');
    // 안전 경고를 삭제하지 않는 것이 원칙 — 강등만 한다.
    expect(slate).toBeDefined();
    expect(slate?.hazardous).toBe(true);
    expect(slate?.confidence).toBe('LOW');
    expect(slate?.note).toContain('2015년');
    expect(slate?.basis).toBe('PHOTO_LEDGER');
  });

  it('대장상 석면 위험이 높은데 모델이 언급을 안 하면 경고를 추가한다', () => {
    const { analysis: out, applied } = applyLedgerConsistency(
      analysis([{ category: 'BRICK', name: '벽돌', confidence: 'HIGH', recyclable: true, hazardous: false }]),
      BRICK_1985,
    );
    expect(out.hazards).toContain(LEDGER_ASBESTOS_HAZARD);
    expect(applied).toContain('asbestos-add-from-ledger');
  });

  it('이미 석면을 경고했으면 중복 추가하지 않는다', () => {
    const { analysis: out } = applyLedgerConsistency(analysis([SLATE]), BRICK_1985);
    expect(out.hazards.filter((h) => h === LEDGER_ASBESTOS_HAZARD)).toHaveLength(0);
  });

  it('대장 주구조 소재가 결과에 없으면 추가한다(사진에 골조가 안 보인 경우)', () => {
    const { analysis: out, applied } = applyLedgerConsistency(analysis([SLATE]), RC_2015);
    const concrete = out.materials.find((m) => m.category === 'CONCRETE');
    expect(concrete).toBeDefined();
    // 사진이 아니라 대장 근거임을 표시해야 사용자가 구분할 수 있다.
    expect(concrete?.basis).toBe('LEDGER');
    expect(applied).toContain('structure-add:CONCRETE');
  });

  it('주구조 소재가 이미 있으면 중복 추가하지 않는다', () => {
    const concrete: DetectedMaterial = {
      category: 'CONCRETE', name: '콘크리트', confidence: 'HIGH', recyclable: true, hazardous: false,
    };
    const { analysis: out } = applyLedgerConsistency(analysis([concrete]), RC_2015);
    expect(out.materials.filter((m) => m.category === 'CONCRETE')).toHaveLength(1);
  });

  it('대장 주구조와 다른 소재가 최대 비중이면 결측 경고로 알린다(수치는 조작하지 않는다)', () => {
    const wood: DetectedMaterial = {
      category: 'WOOD', name: '목재 마감', confidence: 'HIGH', recyclable: true,
      hazardous: false, estimatedRatio: 70,
    };
    const { analysis: out, applied } = applyLedgerConsistency(analysis([wood]), RC_2015);
    expect(applied).toContain('structure-conflict:WOOD');
    expect(out.coverageWarnings.join(' ')).toContain('마감재일 수 있습니다');
    // 비중 자체는 그대로 둔다.
    expect(out.materials.find((m) => m.category === 'WOOD')?.estimatedRatio).toBe(70);
  });
});
