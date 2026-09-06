import {
  MATCH_RADIUS_KM,
  regionMatches,
  haversineDistanceKm,
  requestKindForProvider,
  type MatchStatus,
  type ProviderJobs,
  type ServiceRequest,
} from '@dimol/shared';
import { Router } from 'express';
import { rankByDistance } from '../matching/rank.js';
import { authUserId } from '../middleware/auth.js';
import { RequestStore, RequestValidationError } from '../requests/store.js';
import { UserStore } from '../users/store.js';

/**
 * 업체 일감 피드 (로드맵 Phase 1 — 매칭 수신·수락).
 * 소비자가 올린 철거요청은 철거업체가, 철거업체가 올린 운반/처리 요청은
 * 운반업체/처리장이 각자 유형에 맞는 일감으로 받아 수락(MATCHED)한다.
 *
 * - 운반업체는 콜대기(ONLINE)일 때만 새 콜을 받고 수락할 수 있다.
 * - 미승인(PENDING) 업체는 수락 불가.
 */

/** 수락 후 진행 중으로 보는 상태(내가 배정받은 일감). */
const ASSIGNED_STATUSES: readonly MatchStatus[] = ['MATCHED', 'PAID', 'IN_PROGRESS', 'COMPLETED'];

export function createJobsRouter(requestStore: RequestStore, userStore: UserStore): Router {
  const router = Router();

  // GET /api/jobs  — 내 유형·지역의 새 일감(open) + 내가 수락한 일감(assigned)
  // 요청자는 인증된 본인(토큰)으로 고정한다 — 남의 피드를 조회할 수 없다.
  router.get('/jobs', async (req, res) => {
    const providerId = authUserId(req);
    const provider = await userStore.get(providerId);
    if (!provider) {
      res.status(404).json({ error: '업체를 찾을 수 없습니다.' });
      return;
    }
    const kind = requestKindForProvider(provider.userType);
    if (!kind) {
      res.status(400).json({ error: '일감을 받을 수 있는 업체 유형이 아닙니다.' });
      return;
    }

    // 운반업체가 콜대기 OFF면 새 콜은 감춘다(수락한 일감은 계속 노출).
    const availabilityBlocksOpen =
      provider.userType === 'TRANSPORT_COMPANY' && provider.availability !== 'ONLINE';

    // 기존의 완전일치 region 필터를 제거하고 모든 지역의 open 일감을 가져온다.
    // 반경 30km 필터는 아래 rankByDistance 에서 수행된다.
    const openRaw = availabilityBlocksOpen
      ? []
      : (await requestStore.list({ kind, status: 'REQUESTED' }))
          // 자기가 올린 요청은 제외.
          .filter((r) => r.requesterId !== providerId);

    // 거리 기반 매칭 추천 — 업체 기준 좌표에서 가까운 순으로 정렬(+distanceKm).
    // 운반업체는 사용자 설정 반경(또는 기본 30km) 적용, 그 외 업체는 전국 단위(제한 없음).
    const maxRadiusKm =
      provider.userType === 'TRANSPORT_COMPANY'
        ? (provider.matchRadiusKm ?? MATCH_RADIUS_KM)
        : undefined;

    const open = rankByDistance(provider.location, openRaw, {
      maxRadiusKm,
    });

    const assigned = (await requestStore.list({ providerId })).filter((r) =>
      ASSIGNED_STATUSES.includes(r.status),
    );

    const body: ProviderJobs = { open, assigned };
    res.json(body);
  });

  // POST /api/jobs/:requestId/accept  { amount? } — 선착순 수락 → MATCHED (요청자는 인증된 본인).
  // amount 를 주면 그 금액이 합의 금액(선결제 기준)으로 기록된다(철거/운반 선착순+금액).
  router.post('/jobs/:requestId/accept', async (req, res) => {
    const providerId = authUserId(req);
    const rawAmount = (req.body as { amount?: unknown } | undefined)?.amount;
    let agreedFee: number | undefined;
    if (rawAmount !== undefined) {
      const amount = Number(rawAmount);
      if (!Number.isInteger(amount) || amount <= 0) {
        res.status(400).json({ error: '수락 금액(원, 양의 정수)을 정확히 입력해 주세요.' });
        return;
      }
      agreedFee = amount;
    }
    const provider = await userStore.get(providerId);
    if (!provider) {
      res.status(404).json({ error: '업체를 찾을 수 없습니다.' });
      return;
    }
    if (provider.approvalStatus !== 'APPROVED') {
      res.status(403).json({ error: '승인 완료 후 일감을 수락할 수 있어요.' });
      return;
    }

    const request = await requestStore.get(req.params.requestId);
    if (!request) {
      res.status(404).json({ error: '요청을 찾을 수 없습니다.' });
      return;
    }
    if (requestKindForProvider(provider.userType) !== request.kind) {
      res.status(403).json({ error: '내 업종에 맞는 일감이 아니에요.' });
      return;
    }

    if (request.location && provider.location) {
      const dist = haversineDistanceKm(request.location, provider.location);
      if (dist > MATCH_RADIUS_KM) {
        res.status(400).json({ error: `매칭 반경(${MATCH_RADIUS_KM}km)을 벗어난 일감은 수락할 수 없어요.` });
        return;
      }
    } else if (!regionMatches(request.region, provider.region)) {
      res.status(400).json({ error: '다른 지역의 일감은 수락할 수 없어요.' });
      return;
    }

    if (provider.userType === 'TRANSPORT_COMPANY' && provider.availability !== 'ONLINE') {
      res.status(409).json({ error: '콜대기를 켜야 콜을 수락할 수 있어요.' });
      return;
    }
    if (request.status !== 'REQUESTED') {
      res.status(409).json({ error: '이미 다른 업체가 수락했거나 진행 중인 일감이에요.' });
      return;
    }

    try {
      const updated: ServiceRequest = await requestStore.changeStatus(request.id, 'MATCHED', {
        matchedProviderId: providerId,
        agreedFee,
      });
      res.json(updated);
    } catch (err) {
      if (err instanceof RequestValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: '일감 수락 처리 오류' });
    }
  });

  return router;
}
