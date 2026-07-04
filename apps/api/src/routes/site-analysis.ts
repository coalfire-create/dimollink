import { Router } from 'express';
import {
  SiteAnalysisValidationError,
  type AnalyzeSiteInput,
  type SiteAnalyzer,
} from '../site-analysis/analyzer.js';

/**
 * 현장 사진 AI 분석 API (로드맵 Phase 6).
 * primary(실제 Claude 또는 목) 로 분석하고, 실제 분석이 런타임 실패하면 목으로 폴백한다
 * (올바로 폴백과 같은 원칙 — 화면이 멈추지 않게). PII/이미지 원본은 로그에 남기지 않는다.
 */
export function createSiteAnalysisRouter(primary: SiteAnalyzer, fallback: SiteAnalyzer): Router {
  const router = Router();

  // POST /api/site-analysis/analyze  { imageBase64, mimeType?, note? }
  router.post('/site-analysis/analyze', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const input: AnalyzeSiteInput = {
      imageBase64: typeof body.imageBase64 === 'string' ? body.imageBase64 : undefined,
      mimeType: typeof body.mimeType === 'string' ? body.mimeType : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
    };
    try {
      res.json(await primary.analyze(input));
    } catch (err) {
      if (err instanceof SiteAnalysisValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      // 실제 분석 실패 → 목으로 폴백(방법=MOCK 이라 사용자에게 구분됨).
      console.error('[site-analysis] 분석 폴백', err instanceof Error ? err.message : 'error');
      try {
        res.json(await fallback.analyze(input));
      } catch (fallbackErr) {
        if (fallbackErr instanceof SiteAnalysisValidationError) {
          res.status(400).json({ error: fallbackErr.message });
          return;
        }
        res.status(500).json({ error: '현장 분석 처리 오류' });
      }
    }
  });

  return router;
}
