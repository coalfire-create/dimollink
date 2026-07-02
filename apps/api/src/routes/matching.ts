import {
  isValidGeoPoint,
  type GeoPoint,
  type MatchCandidate,
  type ProviderRole,
} from '@dimol/shared';
import { Router } from 'express';
import { rankCandidatesByDistance, type RankOptions } from '../matching/rank.js';

function parseGeoPoint(raw: unknown): GeoPoint | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { lat, lng } = raw as { lat?: unknown; lng?: unknown };
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const point = { lat, lng };
  return isValidGeoPoint(point) ? point : null;
}

/**
 * 거리 기반 매칭 라우트.
 * 현재는 후보 목록을 요청 본문으로 받는다(파일럿 단계). DB 연동 시 지역/카테고리로
 * 필터링한 후보를 서버가 조회해 넘기도록 교체한다.
 */
export function createMatchingRouter(): Router {
  const router = Router();

  // POST /api/matching/rank  { origin, candidates, role?, maxRadiusKm?, limit? }
  router.post('/matching/rank', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const origin = parseGeoPoint(body.origin);
    if (!origin) {
      res.status(400).json({ error: 'origin({ lat, lng })이 필요합니다.' });
      return;
    }
    if (!Array.isArray(body.candidates)) {
      res.status(400).json({ error: 'candidates(배열)가 필요합니다.' });
      return;
    }

    const options: RankOptions = {};
    if (body.role === 'TRANSPORT' || body.role === 'DISPOSAL') {
      options.role = body.role as ProviderRole;
    }
    if (typeof body.maxRadiusKm === 'number') options.maxRadiusKm = body.maxRadiusKm;
    if (typeof body.limit === 'number') options.limit = body.limit;

    try {
      const ranked = rankCandidatesByDistance(origin, body.candidates as MatchCandidate[], options);
      res.json(ranked);
    } catch (err) {
      // 좌표 형식 오류 등.
      res.status(400).json({ error: err instanceof Error ? err.message : '매칭 처리 오류' });
    }
  });

  return router;
}
