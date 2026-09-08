import { Router, type Response } from 'express';
import { KOREAN_BANKS } from '@dimol/shared';
import { authUserId } from '../middleware/auth.js';
import { PayoutAccountError, type PayoutAccountStore } from '../payout/store.js';

/**
 * 정산 계좌 등록 — 업체가 돈을 받을 곳.
 *
 * 응답에는 마스킹된 계좌번호만 나간다(스토어가 보장한다). 본인에게도 전체를 다시
 * 보여주지 않는 이유는, 등록할 때 이미 알고 있고 화면에 띄우면 어깨너머로 새기 때문이다.
 */
export function createPayoutAccountRouter(store: PayoutAccountStore): Router {
  const router = Router();

  function fail(err: unknown, res: Response): void {
    if (err instanceof PayoutAccountError) {
      const status = err.message.includes('찾을 수 없습니다') ? 404 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: '정산 계좌 처리 오류' });
  }

  // GET /api/payout-accounts/banks — 은행 목록(선택지)
  router.get('/payout-accounts/banks', (_req, res) => {
    res.json(KOREAN_BANKS);
  });

  // GET /api/payout-accounts/me — 내 정산 계좌(마스킹)
  router.get('/payout-accounts/me', async (req, res) => {
    const account = await store.get(authUserId(req));
    // 미등록도 정상 상태다 — 404 로 만들면 화면이 오류처럼 다뤄야 한다.
    res.json(account ?? null);
  });

  // PUT /api/payout-accounts/me  { bankCode, accountNumber, holderName }
  router.put('/payout-accounts/me', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      res.json(
        await store.register({
          userId: authUserId(req),
          bankCode: String(body.bankCode ?? ''),
          accountNumber: String(body.accountNumber ?? ''),
          holderName: String(body.holderName ?? ''),
        }),
      );
    } catch (err) {
      fail(err, res);
    }
  });

  return router;
}
