import {
  MATCH_RADIUS_KM,
  isValidGeoPoint,
  type GeoPoint,
  type MatchCandidate,
  type ProviderRole,
} from '@dimol/shared';
import { Router } from 'express';
import { rankCandidatesByDistance, type RankOptions } from '../matching/rank.js';
import {
  recommendCandidates,
  type RecommendCandidate,
  type RecommendOptions,
} from '../matching/recommend.js';

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
/** 평점 조회 훅 — 리뷰 저장소(Phase 2)에서 평균 평점을 가져온다. 없으면 후보 입력값 사용. */
export type RatingLookup = (providerId: string) => number | null | Promise<number | null>;

export function createMatchingRouter(ratingLookup?: RatingLookup): Router {
  const router = Router();

  function parseCommonOptions(body: Record<string, unknown>): RankOptions {
    const options: RankOptions = {};
    if (body.role === 'TRANSPORT' || body.role === 'DISPOSAL') {
      options.role = body.role as ProviderRole;
    }
    if (typeof body.maxRadiusKm === 'number') options.maxRadiusKm = body.maxRadiusKm;
    // 운반업체 후보는 명시 지정이 없으면 기본 반경 30km 이내만 노출한다.
    else if (options.role === 'TRANSPORT') options.maxRadiusKm = MATCH_RADIUS_KM;
    if (typeof body.limit === 'number') options.limit = body.limit;
    return options;
  }

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

    try {
      const ranked = rankCandidatesByDistance(
        origin,
        body.candidates as MatchCandidate[],
        parseCommonOptions(body),
      );
      res.json(ranked);
    } catch (err) {
      // 좌표 형식 오류 등.
      res.status(400).json({ error: err instanceof Error ? err.message : '매칭 처리 오류' });
    }
  });

  // POST /api/matching/recommend — 가중치 추천 정렬 (로드맵 Phase 3)
  // { origin, candidates: [{ ..., price?, rating? }], weights?: { distance?, price?, rating? }, ... }
  router.post('/matching/recommend', async (req, res) => {
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

    const options: RecommendOptions = parseCommonOptions(body);
    if (typeof body.weights === 'object' && body.weights !== null) {
      const w = body.weights as Record<string, unknown>;
      options.weights = {
        ...(typeof w.distance === 'number' ? { distance: w.distance } : {}),
        ...(typeof w.price === 'number' ? { price: w.price } : {}),
        ...(typeof w.rating === 'number' ? { rating: w.rating } : {}),
      };
    }

    // 평점 미지정 후보는 리뷰 저장소의 평균 평점으로 채운다.
    const candidates = await Promise.all(
      (body.candidates as RecommendCandidate[]).map(async (c) =>
        c.rating === undefined && ratingLookup ? { ...c, rating: await ratingLookup(c.id) } : c,
      ),
    );

    try {
      res.json(recommendCandidates(origin, candidates, options));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '매칭 처리 오류' });
    }
  });

  return router;
}
