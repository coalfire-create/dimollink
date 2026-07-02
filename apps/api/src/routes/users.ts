import type { UserApprovalStatus, UserRole } from '@dimol/shared';
import { Router } from 'express';
import { UserStore, UserValidationError, type CreateUserInput } from '../users/store.js';

/**
 * 회원 온보딩·프로필 API (로드맵 Phase 1 §4.1).
 * 배출자/업체 구분 가입, 프로필 조회·수정.
 * [올바로 인증 업체] 배지 갱신은 올바로 검증 라우트(민감 영역) 몫 — 여기서는 읽기만.
 */
export function createUsersRouter(store: UserStore): Router {
  const router = Router();

  function handleError(err: unknown, res: { status(code: number): { json(body: unknown): void } }) {
    if (err instanceof UserValidationError) {
      const status = err.message.includes('찾을 수 없습니다') ? 404 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: '회원 처리 오류' });
  }

  // POST /api/users — 온보딩 (배출자/업체 구분)
  router.post('/users', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const user = store.create({
        role: body.role,
        name: body.name,
        region: body.region,
        phone: typeof body.phone === 'string' ? body.phone : undefined,
        businessNumber: typeof body.businessNumber === 'string' ? body.businessNumber : undefined,
      } as CreateUserInput);
      res.status(201).json(user);
    } catch (err) {
      handleError(err, res);
    }
  });

  // GET /api/users?role=&approvalStatus= — 목록
  router.get('/users', (req, res) => {
    const { role, approvalStatus } = req.query;
    res.json(
      store.list({
        role: typeof role === 'string' ? (role as UserRole) : undefined,
        approvalStatus:
          typeof approvalStatus === 'string'
            ? (approvalStatus as UserApprovalStatus)
            : undefined,
      }),
    );
  });

  // GET /api/users/:id — 프로필 조회 (올바로 배지·평점 노출용)
  router.get('/users/:id', (req, res) => {
    const user = store.get(req.params.id);
    if (!user) {
      res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
      return;
    }
    res.json(user);
  });

  // PATCH /api/users/:id — 프로필 수정 (이름/연락처/지역)
  router.patch('/users/:id', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      res.json(
        store.update(req.params.id, {
          name: typeof body.name === 'string' ? body.name : undefined,
          region: typeof body.region === 'string' ? body.region : undefined,
          phone: typeof body.phone === 'string' ? body.phone : undefined,
        }),
      );
    } catch (err) {
      handleError(err, res);
    }
  });

  return router;
}
