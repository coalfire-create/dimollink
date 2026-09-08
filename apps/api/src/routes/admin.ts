import {
  visionMaterialLabel,
  type MatchOfferStatus,
  type MatchStatus,
  type UserApprovalStatus,
  type VisionMaterialCode,
} from '@dimol/shared';
import { Router, type RequestHandler } from 'express';
import type { AnomalyDetector } from '../anomaly/detect.js';
import { adminActor, createAdminAuth } from '../middleware/admin-auth.js';
import type { OfferStore } from '../offers/store.js';
import type { PricingStore } from '../pricing/store.js';
import type { QuoteStore } from '../quotes/store.js';
import type { RequestStore } from '../requests/store.js';
import { ReviewValidationError, type ReviewStore } from '../reviews/store.js';
import { UserValidationError, type UserStore } from '../users/store.js';

/**
 * 관리자 백오피스 API (로드맵 Phase 5).
 * 전 엔드포인트가 x-admin-token 가드 뒤에 있다. 업체 승인/정지, 분쟁 조정,
 * 매칭 현황(요청/오퍼) 모니터링을 제공한다.
 */

export interface AdminStores {
  userStore: UserStore;
  reviewStore: ReviewStore;
  requestStore: RequestStore;
  offerStore: OfferStore;
  anomalyDetector: AnomalyDetector;
  quoteStore: QuoteStore;
  pricingStore: PricingStore;
}

/**
 * @param guard 관리자 가드. 앱은 계정(role=ADMIN)+공유 토큰 양쪽을 받는 가드를 넘긴다.
 *   문자열을 넘기면 공유 토큰만 검사한다(테스트·구버전 호출부 호환).
 */
export function createAdminRouter(
  stores: AdminStores,
  guard: RequestHandler | string | undefined,
): Router {
  const router = Router();
  router.use('/admin', typeof guard === 'function' ? guard : createAdminAuth(guard));

  function handleError(err: unknown, res: { status(code: number): { json(body: unknown): void } }) {
    if (err instanceof UserValidationError || err instanceof ReviewValidationError) {
      const status = err.message.includes('찾을 수 없습니다') ? 404 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: '백오피스 처리 오류' });
  }

  // GET /api/admin/users?approvalStatus=PENDING — 승인 대기 업체 큐
  router.get('/admin/users', async (req, res) => {
    const { approvalStatus } = req.query;
    res.json(
      await stores.userStore.list({
        approvalStatus:
          typeof approvalStatus === 'string'
            ? (approvalStatus as UserApprovalStatus)
            : undefined,
      }),
    );
  });

  // PATCH /api/admin/users/:id/approval  { status: APPROVED | SUSPENDED | PENDING }
  router.patch('/admin/users/:id/approval', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const status = body.status;
    if (status !== 'APPROVED' && status !== 'SUSPENDED' && status !== 'PENDING') {
      res.status(400).json({ error: 'status 는 APPROVED | SUSPENDED | PENDING 이어야 합니다.' });
      return;
    }
    try {
      res.json(await stores.userStore.setApprovalStatus(req.params.id, status));
    } catch (err) {
      handleError(err, res);
    }
  });

  // PATCH /api/admin/users/:id/role  { role: ADMIN | MEMBER }
  // 첫 관리자는 공유 운영 토큰으로 이 엔드포인트를 불러 지정한다(부트스트랩).
  // 그 뒤로는 관리자 계정 로그인만으로 백오피스를 쓸 수 있어, 행위가 사람에게 남는다.
  router.patch('/admin/users/:id/role', async (req, res) => {
    const role = (req.body ?? {}).role;
    if (role !== 'ADMIN' && role !== 'MEMBER') {
      res.status(400).json({ error: 'role 은 ADMIN | MEMBER 이어야 합니다.' });
      return;
    }
    // 자기 권한을 스스로 떼면 백오피스에서 잠긴다. 공유 토큰이 있으면 복구되지만,
    // 실수로 그 상황에 들어가는 것 자체를 막는다.
    const actor = adminActor(req);
    if (actor && actor.id === req.params.id && role === 'MEMBER') {
      res.status(400).json({ error: '자신의 관리자 권한은 스스로 해제할 수 없습니다.' });
      return;
    }
    try {
      const updated = await stores.userStore.setRole(req.params.id, role);
      // 누가 누구의 권한을 바꿨는지 남긴다. 공유 토큰 경로면 행위자가 없다는 사실까지 남긴다.
      console.info(
        `[admin] role 변경 ${req.params.id} → ${role} (by ${actor?.id ?? 'SHARED_TOKEN'})`,
      );
      res.json(updated);
    } catch (err) {
      handleError(err, res);
    }
  });

  // GET /api/admin/incidents?status=OPEN — 노쇼/분쟁 조정 큐
  router.get('/admin/incidents', async (req, res) => {
    const { status, targetId } = req.query;
    res.json(
      await stores.reviewStore.listIncidents({
        status: status === 'OPEN' || status === 'RESOLVED' ? status : undefined,
        targetId: typeof targetId === 'string' ? targetId : undefined,
      }),
    );
  });

  // POST /api/admin/incidents/:id/resolve  { resolutionNote? }
  router.post('/admin/incidents/:id/resolve', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      res.json(
        await stores.reviewStore.resolveIncident(
          req.params.id,
          typeof body.resolutionNote === 'string' ? body.resolutionNote : undefined,
        ),
      );
    } catch (err) {
      handleError(err, res);
    }
  });

  // GET /api/admin/requests?status= — 매칭 현황 모니터링 (전체 요청 로그)
  router.get('/admin/requests', async (req, res) => {
    const { status } = req.query;
    res.json(
      await stores.requestStore.list({
        status: typeof status === 'string' ? (status as MatchStatus) : undefined,
      }),
    );
  });

  // GET /api/admin/offers?status= — 매칭 제안 로그 (타임아웃/거절 현황)
  router.get('/admin/offers', async (req, res) => {
    const { status } = req.query;
    res.json(
      await stores.offerStore.list({
        status: typeof status === 'string' ? (status as MatchOfferStatus) : undefined,
      }),
    );
  });

  // GET /api/admin/anomalies — 이상거래 탐지 결과 (룰 기반, 수동 조치용)
  router.get('/admin/anomalies', async (_req, res) => {
    res.json(await stores.anomalyDetector.detect());
  });

  // GET /api/admin/waste-materials — 소재별 kg 입력 현황(전체 요청 wasteItems 집계)
  router.get('/admin/waste-materials', async (_req, res) => {
    const agg = new Map<VisionMaterialCode, { totalKg: number; itemCount: number }>();
    for (const request of await stores.requestStore.list()) {
      for (const item of request.wasteItems) {
        const cur = agg.get(item.material) ?? { totalKg: 0, itemCount: 0 };
        cur.totalKg += item.kg;
        cur.itemCount += 1;
        agg.set(item.material, cur);
      }
    }
    const rows = [...agg.entries()]
      .map(([material, v]) => ({
        material,
        label: visionMaterialLabel(material),
        totalKg: v.totalKg,
        itemCount: v.itemCount,
      }))
      .sort((a, b) => b.totalKg - a.totalKg);
    res.json(rows);
  });

  // GET /api/admin/quotes-summary — 밀봉 견적 현황(요청별 제출 건수만, 금액 비노출)
  router.get('/admin/quotes-summary', async (_req, res) => {
    const counts = new Map<string, number>();
    for (const q of await stores.quoteStore.listQuotes()) {
      counts.set(q.requestId, (counts.get(q.requestId) ?? 0) + 1);
    }
    const rows = [...counts.entries()]
      .map(([requestId, quoteCount]) => ({ requestId, quoteCount }))
      .sort((a, b) => b.quoteCount - a.quoteCount);
    res.json(rows);
  });

  // GET /api/admin/pricing — 업체 단가 설정 현황
  router.get('/admin/pricing', async (_req, res) => {
    res.json(await stores.pricingStore.list());
  });

  return router;
}
