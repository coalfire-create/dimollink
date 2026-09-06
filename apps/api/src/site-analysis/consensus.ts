import {
  confidenceFromDetectionRate,
  type AnalysisConfidence,
  type DetectedMaterial,
  type MaterialCategory,
  type SiteAnalysis,
} from '@dimol/shared';
import { assertValidImages, type AnalyzeSiteInput, type SiteAnalyzer } from './analyzer.js';

/**
 * 사진 간 교차검증(합의) 분석기.
 *
 * 문제: 여러 장을 한 번에 넣고 JSON 하나를 받으면, 각 소재의 confidence 는 모델
 * 자가보고일 뿐이라 근거가 없다. 근거 없이 HIGH 로 나오고, 한 장에서만 잘못 본
 * 소재도 그대로 결과에 남는다.
 *
 * 해법: 사진을 한 장씩 따로 분석해 **몇 장에서 같은 소재가 보였는지**로 신뢰도를 정한다.
 * "6장 중 5장에서 확인" 은 모델이 스스로 매긴 HIGH 보다 훨씬 정직한 신호이고,
 * 한 장에서만 튀어나온 오인식은 자연히 LOW 로 내려가 UI 에서 걸러낼 수 있다.
 *
 * 종합 리포트(요약·공정·위험)는 전체 사진을 함께 본 1회 호출이 더 낫기 때문에,
 * 종합 1회 + 장당 1회 = N+1 회를 호출한다. 비용이 사진 수에 비례해 늘어나므로
 * `enabled` 로 끌 수 있게 두었다(`VISION_CONSENSUS=off`).
 */
export class ConsensusSiteAnalyzer implements SiteAnalyzer {
  constructor(
    private readonly inner: SiteAnalyzer,
    private readonly enabled = true,
  ) {}

  async analyze(input: AnalyzeSiteInput): Promise<SiteAnalysis> {
    const images = assertValidImages(input);
    // 한 장이면 교차검증할 대상이 없다 — 추가 비용 없이 그대로 위임한다.
    if (!this.enabled || images.length < 2) return this.inner.analyze(input);

    const combined = await this.inner.analyze(input);

    // 장당 독립 분석. 일부가 실패해도 나머지 표로 진행한다(분석 자체를 실패시키지 않는다).
    const perImage = await Promise.all(
      images.map(async (image) => {
        try {
          return await this.inner.analyze({ ...input, imageBase64: undefined, images: [image] });
        } catch {
          return null;
        }
      }),
    );
    const votes = perImage.filter((r): r is SiteAnalysis => r !== null);
    if (votes.length < 2) return combined;

    const materials = mergeByVote(combined.materials, votes, votes.length);
    return { ...combined, materials, confidence: overallConfidence(materials, votes.length) };
  }
}

/** 소재별 표를 세어 신뢰도를 다시 매긴다. 종합 분석에만 있던 소재도 1표로 인정한다. */
export function mergeByVote(
  combinedMaterials: readonly DetectedMaterial[],
  votes: readonly SiteAnalysis[],
  photoCount: number,
): DetectedMaterial[] {
  const counts = new Map<MaterialCategory, number>();
  for (const vote of votes) {
    // 같은 사진 안에서 같은 소재가 두 번 나와도 1표다.
    const seen = new Set(vote.materials.map((m) => m.category));
    for (const category of seen) counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const byCategory = new Map<MaterialCategory, DetectedMaterial>();
  for (const m of combinedMaterials) {
    if (!byCategory.has(m.category)) byCategory.set(m.category, m);
  }
  // 장당 분석에서만 나온 소재도 놓치지 않는다(종합 1회가 흘린 것).
  for (const vote of votes) {
    for (const m of vote.materials) {
      if (!byCategory.has(m.category)) byCategory.set(m.category, m);
    }
  }

  return Array.from(byCategory.values())
    .map((m) => {
      const detectedIn = counts.get(m.category) ?? 0;
      return {
        ...m,
        detectedIn,
        photoCount,
        basis: 'PHOTO' as const,
        // 모델 자가보고를 덮어쓴다 — 검출률이 근거 있는 신호다.
        confidence: confidenceFromDetectionRate(detectedIn / photoCount),
      };
    })
    .sort((a, b) => (b.detectedIn ?? 0) - (a.detectedIn ?? 0));
}

/**
 * 현장 전체 신뢰도 — 사진 수와 사진 간 일치도로 정한다.
 * 사진이 적으면 무엇을 봤든 현장 전체를 확신할 수 없다.
 */
export function overallConfidence(
  materials: readonly DetectedMaterial[],
  photoCount: number,
): AnalysisConfidence {
  if (materials.length === 0) return 'LOW';
  const agreed = materials.filter((m) => m.confidence === 'HIGH').length;
  if (photoCount >= 4 && agreed > 0) return 'HIGH';
  if (photoCount >= 2 && materials.some((m) => m.confidence !== 'LOW')) return 'MEDIUM';
  return 'LOW';
}
