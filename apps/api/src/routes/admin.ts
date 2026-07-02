import type { MatchOfferStatus, MatchStatus, UserApprovalStatus } from '@dimol/shared';
import { Router } from 'express';
import type { AnomalyDetector } from '../anomaly/detect.js';
import { createAdminAuth } from '../middleware/admin-auth.js';
import type { OfferStore } from '../offers/store.js';
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
}

export function createAdminRouter(stores: AdminStores, adminToken: string | undefined): Router {
  const router = Router();
  router.use('/admin', createAdminAuth(adminToken));

  function handleError(err: unknown, res: { status(code: number): { json(body: unknown): void } }) {
    if (err instanceof UserValidationError || err instanceof ReviewValidationError) {
      const status = err.message.includes('찾을 수 없습니다') ? 404 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: '백오피스 처리 오류' });
  }

  // GET /api/admin/users?approvalStatus=PENDING — 승인 대기 업체 큐
  router.get('/admin/users', (req, res) => {
    const { approvalStatus } = req.query;
    res.json(
      stores.userStore.list({
        approvalStatus:
          typeof approvalStatus === 'string'
            ? (approvalStatus as UserApprovalStatus)
            : undefined,
      }),
    );
  });

  // PATCH /api/admin/users/:id/approval  { status: APPROVED | SUSPENDED | PENDING }
  router.patch('/admin/users/:id/approval', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const status = body.status;
    if (status !== 'APPROVED' && status !== 'SUSPENDED' && status !== 'PENDING') {
      res.status(400).json({ error: 'status 는 APPROVED | SUSPENDED | PENDING 이어야 합니다.' });
      return;
    }
    try {
      res.json(stores.userStore.setApprovalStatus(req.params.id, status));
    } catch (err) {
      handleError(err, res);
    }
  });

  // GET /api/admin/incidents?status=OPEN — 노쇼/분쟁 조정 큐
  router.get('/admin/incidents', (req, res) => {
    const { status, targetId } = req.query;
    res.json(
      stores.reviewStore.listIncidents({
        status: status === 'OPEN' || status === 'RESOLVED' ? status : undefined,
        targetId: typeof targetId === 'string' ? targetId : undefined,
      }),
    );
  });

  // POST /api/admin/incidents/:id/resolve  { resolutionNote? }
  router.post('/admin/incidents/:id/resolve', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      res.json(
        stores.reviewStore.resolveIncident(
          req.params.id,
          typeof body.resolutionNote === 'string' ? body.resolutionNote : undefined,
        ),
      );
    } catch (err) {
      handleError(err, res);
    }
  });

  // GET /api/admin/requests?status= — 매칭 현황 모니터링 (전체 요청 로그)
  router.get('/admin/requests', (req, res) => {
    const { status } = req.query;
    res.json(
      stores.requestStore.list({
        status: typeof status === 'string' ? (status as MatchStatus) : undefined,
      }),
    );
  });

  // GET /api/admin/offers?status= — 매칭 제안 로그 (타임아웃/거절 현황)
  router.get('/admin/offers', (req, res) => {
    const { status } = req.query;
    res.json(
      stores.offerStore.list({
        status: typeof status === 'string' ? (status as MatchOfferStatus) : undefined,
      }),
    );
  });

  // GET /api/admin/anomalies — 이상거래 탐지 결과 (룰 기반, 수동 조치용)
  router.get('/admin/anomalies', (_req, res) => {
    res.json(stores.anomalyDetector.detect());
  });

  return router;
}
