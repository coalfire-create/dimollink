import { Router, type RequestHandler, type Response } from 'express';
import { ParityValidationError, type EstimateParityService } from '../estimate-parity/service.js';
import { createAdminAuth } from '../middleware/admin-auth.js';

/**
 * 원격 vs 방문 견적 정합성 — 관리자 전용 라우트(HTTP 처리만).
 *
 * 관리자 라우터([[admin]])와 같은 가드를 쓴다. 파일을 나눈 이유는 한 파일 = 한 책임이고,
 * admin.ts 가 이미 300줄 가까이 돼서다.
 *
 * @param guard 앱의 requireAdmin(계정 role=ADMIN + 공유 토큰). 문자열이면 공유 토큰만 검사(테스트용).
 */
export function createEstimateParityRouter(
  service: EstimateParityService,
  guard: RequestHandler | string | undefined,
): Router {
  const router = Router();
  router.use('/admin/estimate-parity', typeof guard === 'function' ? guard : createAdminAuth(guard));

  function fail(err: unknown, res: Response): void {
    if (err instanceof ParityValidationError) {
      res.status(err.message.includes('찾을 수 없습니다') ? 404 : 400).json({ error: err.message });
      return;
    }
    console.error('[estimate-parity] 처리 오류', err instanceof Error ? err.message : err);
    res.status(500).json({ error: '정합성 처리 오류' });
  }

  // GET /api/admin/estimate-parity — 보고서 + 표본 목록
  router.get('/admin/estimate-parity', async (_req, res) => {
    try {
      res.json(await service.listWithReport());
    } catch (err) {
      fail(err, res);
    }
  });

  // POST /api/admin/estimate-parity/samples — 시범 현장 직원 입력(MANUAL)
  router.post('/admin/estimate-parity/samples', async (req, res) => {
    try {
      res.status(201).json(await service.addManual(req.body));
    } catch (err) {
      fail(err, res);
    }
  });

  // POST /api/admin/estimate-parity/refresh — 철거 견적에서 AUTO 표본 재계산(멱등)
  router.post('/admin/estimate-parity/refresh', async (_req, res) => {
    try {
      const summary = await service.refreshAuto();
      res.json({ summary, ...(await service.listWithReport()) });
    } catch (err) {
      fail(err, res);
    }
  });

  // PATCH /api/admin/estimate-parity/samples/:id/actual-ton  { actualTon }
  router.patch('/admin/estimate-parity/samples/:id/actual-ton', async (req, res) => {
    try {
      res.json(await service.setActualTon(req.params.id, (req.body ?? {}).actualTon));
    } catch (err) {
      fail(err, res);
    }
  });

  // DELETE /api/admin/estimate-parity/samples/:id — 잘못 넣은 표본 삭제
  router.delete('/admin/estimate-parity/samples/:id', async (req, res) => {
    try {
      await service.remove(req.params.id);
      res.status(204).end();
    } catch (err) {
      fail(err, res);
    }
  });

  return router;
}
