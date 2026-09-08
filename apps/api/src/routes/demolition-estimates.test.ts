import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { MAX_SITE_VISITS_PER_REQUEST } from '@dimol/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DemolitionEstimateStore } from '../demolition/store.js';
import { RequestStore } from '../requests/store.js';
import { UserStore } from '../users/store.js';
import { createDemolitionEstimateRouter } from './demolition-estimates.js';

/**
 * 철거 견적 3단계를 실제 서버로 끝까지 돌린다.
 * 금액이 계약으로 이어지는 경로라, 단계를 건너뛰거나 남의 것을 건드릴 수 있으면 안 된다.
 */

let server: Server | undefined;
let base: string;
let requestStore: RequestStore;
let userStore: UserStore;
let store: DemolitionEstimateStore;
/** 요청 헤더 대신 이 값으로 인증된 사용자를 흉내 낸다. */
let actingUserId = '';

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

beforeEach(async () => {
  requestStore = new RequestStore();
  userStore = new UserStore();
  store = new DemolitionEstimateStore(requestStore);

  const app = express();
  app.use(express.json());
  // requireAuth 대신 테스트가 지정한 사용자로 고정한다(라우트 로직만 검증).
  app.use((req, _res, next) => {
    (req as { authUser?: unknown }).authUser = { id: actingUserId };
    next();
  });
  app.use('/api', createDemolitionEstimateRouter(store, requestStore, userStore));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
});

/** 계정마다 달라야 하는 값들. 순번으로 만들어 테스트끼리 충돌하지 않게 한다. */
let accountSeq = 0;
function nextPhone(): string {
  accountSeq += 1;
  return `0101111${String(accountSeq).padStart(4, '0')}`;
}

/** 체크섬이 유효한 사업자등록번호(가입 시 검증을 통과해야 한다). */
const TEST_BUSINESS_NUMBERS = ["1208141003", "1208141018", "1208141022", "1208141037", "1208141041", "1208141056", "1208141060", "1208141075", "1208141089", "1208141094", "1208141100", "1208141115", "1208141129", "1208141134", "1208141148", "1208141153", "1208141167", "1208141172", "1208141186", "1208141191", "1208141207", "1208141212", "1208141226", "1208141231", "1208141245", "1208141250", "1208141264", "1208141279", "1208141283", "1208141298", "1208141304", "1208141319", "1208141323", "1208141338", "1208141342", "1208141357", "1208141361", "1208141376", "1208141380", "1208141395"];
let bizSeq = 0;
function nextBusinessNumber(): string {
  const value = TEST_BUSINESS_NUMBERS[bizSeq % TEST_BUSINESS_NUMBERS.length];
  bizSeq += 1;
  return value;
}

async function approvedCompany(name: string) {
  const user = await userStore.create({
    userType: 'DEMOLITION_COMPANY',
    name,
    region: '양평',
    phone: nextPhone(),
    businessNumber: nextBusinessNumber(),
  } as never);
  return userStore.setApprovalStatus(user.id, 'APPROVED');
}

async function consumer() {
  return userStore.create({
    userType: 'CONSUMER',
    name: '배출자',
    region: '양평',
    phone: nextPhone(),
  } as never);
}

async function demolitionRequest(requesterId: string) {
  return requestStore.create({
    kind: 'DEMOLITION',
    requesterId,
    region: '양평',
    wasteCategory: 'CONSTRUCTION',
    wasteTons: 10,
    siteAddress: '양평읍 1',
  } as never);
}

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('1단계 — 개산 견적(범위)', () => {
  it('철거업체가 범위를 제출한다', async () => {
    const company = await approvedCompany('대한철거');
    const buyer = await consumer();
    const request = await demolitionRequest(buyer.id);

    actingUserId = company.id;
    const res = await post('/api/demolition-estimates', {
      requestId: request.id,
      minAmount: 8_000_000,
      maxAmount: 12_000_000,
      memo: '외부 사진 기준',
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.stage).toBe('PRELIMINARY');
    expect(body.preliminary.maxAmount).toBe(12_000_000);
    // 개산 단계에서는 확정 금액이 없어야 한다 — 있으면 계약금액으로 오인된다.
    expect(body.final).toBeUndefined();
  });

  it('철거업체가 아니면 거부', async () => {
    const buyer = await consumer();
    const request = await demolitionRequest(buyer.id);
    actingUserId = buyer.id;
    const res = await post('/api/demolition-estimates', {
      requestId: request.id,
      minAmount: 1_000_000,
      maxAmount: 2_000_000,
    });
    expect(res.status).toBe(403);
  });

  it('같은 업체가 두 번 내지 못한다', async () => {
    const company = await approvedCompany('대한철거');
    const buyer = await consumer();
    const request = await demolitionRequest(buyer.id);
    actingUserId = company.id;
    const payload = { requestId: request.id, minAmount: 8_000_000, maxAmount: 12_000_000 };
    expect((await post('/api/demolition-estimates', payload)).status).toBe(201);
    expect((await post('/api/demolition-estimates', payload)).status).toBe(400);
  });
});

describe('2단계 — 실사 예약(최대 3곳)', () => {
  async function withEstimates(count: number) {
    const buyer = await consumer();
    const request = await demolitionRequest(buyer.id);
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const company = await approvedCompany(`철거${i}`);
      actingUserId = company.id;
      const res = await post('/api/demolition-estimates', {
        requestId: request.id,
        minAmount: 8_000_000,
        maxAmount: 12_000_000,
      });
      ids.push((await res.json()).id);
    }
    return { buyer, request, ids };
  }

  it('요청자가 실사를 예약한다', async () => {
    const { buyer, ids } = await withEstimates(1);
    actingUserId = buyer.id;
    const res = await post(`/api/demolition-estimates/${ids[0]}/visit`, {
      scheduledAt: '2026-09-20T09:00:00.000Z',
    });
    expect(res.status).toBe(200);
    expect((await res.json()).stage).toBe('VISIT_SCHEDULED');
  });

  it('상한을 넘으면 거부한다 — 헛걸음이 곧 견적에 얹힌다', async () => {
    const { buyer, ids } = await withEstimates(MAX_SITE_VISITS_PER_REQUEST + 1);
    actingUserId = buyer.id;
    for (let i = 0; i < MAX_SITE_VISITS_PER_REQUEST; i += 1) {
      const ok = await post(`/api/demolition-estimates/${ids[i]}/visit`, {
        scheduledAt: '2026-09-20T09:00:00.000Z',
      });
      expect(ok.status).toBe(200);
    }
    const over = await post(`/api/demolition-estimates/${ids[MAX_SITE_VISITS_PER_REQUEST]}/visit`, {
      scheduledAt: '2026-09-20T09:00:00.000Z',
    });
    expect(over.status).toBe(400);
    expect((await over.json()).error).toContain('최대 3곳');
  });

  it('예약을 취소하면 자리가 비어 다른 곳을 부를 수 있다', async () => {
    const { buyer, ids } = await withEstimates(MAX_SITE_VISITS_PER_REQUEST + 1);
    actingUserId = buyer.id;
    for (let i = 0; i < MAX_SITE_VISITS_PER_REQUEST; i += 1) {
      await post(`/api/demolition-estimates/${ids[i]}/visit`, {
        scheduledAt: '2026-09-20T09:00:00.000Z',
      });
    }
    const cancel = await fetch(`${base}/api/demolition-estimates/${ids[0]}/visit`, {
      method: 'DELETE',
    });
    expect(cancel.status).toBe(200);
    const retry = await post(
      `/api/demolition-estimates/${ids[MAX_SITE_VISITS_PER_REQUEST]}/visit`,
      { scheduledAt: '2026-09-20T09:00:00.000Z' },
    );
    expect(retry.status).toBe(200);
  });

  it('남의 요청에는 예약할 수 없다', async () => {
    const { ids } = await withEstimates(1);
    const stranger = await consumer();
    actingUserId = stranger.id;
    const res = await post(`/api/demolition-estimates/${ids[0]}/visit`, {
      scheduledAt: '2026-09-20T09:00:00.000Z',
    });
    expect(res.status).toBe(400);
  });
});

describe('3단계 — 확정 견적과 수락', () => {
  async function readyForFinal() {
    const company = await approvedCompany('대한철거');
    const buyer = await consumer();
    const request = await demolitionRequest(buyer.id);
    actingUserId = company.id;
    const created = await (
      await post('/api/demolition-estimates', {
        requestId: request.id,
        minAmount: 8_000_000,
        maxAmount: 12_000_000,
      })
    ).json();
    actingUserId = buyer.id;
    await post(`/api/demolition-estimates/${created.id}/visit`, {
      scheduledAt: '2026-09-20T09:00:00.000Z',
    });
    return { company, buyer, request, estimateId: created.id as string };
  }

  it('실사 전에는 확정 견적을 못 낸다', async () => {
    const company = await approvedCompany('대한철거');
    const buyer = await consumer();
    const request = await demolitionRequest(buyer.id);
    actingUserId = company.id;
    const created = await (
      await post('/api/demolition-estimates', {
        requestId: request.id,
        minAmount: 8_000_000,
        maxAmount: 12_000_000,
      })
    ).json();
    const res = await post(`/api/demolition-estimates/${created.id}/final`, { amount: 10_000_000 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('현장 실사');
  });

  it('개산 안이면 사유 없이 확정된다', async () => {
    const { company, estimateId } = await readyForFinal();
    actingUserId = company.id;
    const res = await post(`/api/demolition-estimates/${estimateId}/final`, {
      amount: 11_000_000,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stage).toBe('FINAL');
    expect(body.final.amount).toBe(11_000_000);
  });

  it('개산을 넘으면 사유 없이는 거부한다 — 저가후려치기를 막는 장치', async () => {
    const { company, estimateId } = await readyForFinal();
    actingUserId = company.id;
    const noReason = await post(`/api/demolition-estimates/${estimateId}/final`, {
      amount: 15_000_000,
    });
    expect(noReason.status).toBe(400);

    const withReason = await post(`/api/demolition-estimates/${estimateId}/final`, {
      amount: 15_000_000,
      overrunReason: '지하 정화조 발견, 폐기물 30톤 추가',
    });
    expect(withReason.status).toBe(200);
    // 사유는 소비자에게 그대로 보여야 하므로 저장돼야 한다.
    expect((await withReason.json()).final.overrunReason).toContain('정화조');
  });

  it('남의 견적은 제출할 수 없다', async () => {
    const { estimateId } = await readyForFinal();
    const other = await approvedCompany('다른철거');
    actingUserId = other.id;
    const res = await post(`/api/demolition-estimates/${estimateId}/final`, { amount: 10_000_000 });
    expect(res.status).toBe(400);
  });

  it('수락하면 매칭이 확정되고 계약금액이 확정 견적으로 잡힌다', async () => {
    const { company, buyer, request, estimateId } = await readyForFinal();
    actingUserId = company.id;
    await post(`/api/demolition-estimates/${estimateId}/final`, { amount: 11_000_000 });

    actingUserId = buyer.id;
    const res = await post(`/api/demolition-estimates/${estimateId}/accept`, {});
    expect(res.status).toBe(200);

    const updated = await requestStore.get(request.id);
    expect(updated?.status).toBe('MATCHED');
    expect(updated?.matchedProviderId).toBe(company.id);
    // 계약금액은 개산이 아니라 확정 견적이어야 한다.
    expect(updated?.agreedFee).toBe(11_000_000);
  });

  it('확정 전에는 수락할 수 없다', async () => {
    const { buyer, estimateId } = await readyForFinal();
    actingUserId = buyer.id;
    const res = await post(`/api/demolition-estimates/${estimateId}/accept`, {});
    expect(res.status).toBe(400);
  });
});

describe('밀봉 — 업체는 남의 견적을 못 본다', () => {
  it('요청자는 전부 보고 업체는 자기 것만 본다', async () => {
    const buyer = await consumer();
    const request = await demolitionRequest(buyer.id);
    const a = await approvedCompany('철거A');
    const b = await approvedCompany('철거B');
    for (const company of [a, b]) {
      actingUserId = company.id;
      await post('/api/demolition-estimates', {
        requestId: request.id,
        minAmount: 8_000_000,
        maxAmount: 12_000_000,
      });
    }

    actingUserId = buyer.id;
    const all = await (await fetch(`${base}/api/demolition-estimates?requestId=${request.id}`)).json();
    expect(all).toHaveLength(2);

    actingUserId = a.id;
    const mine = await (await fetch(`${base}/api/demolition-estimates?requestId=${request.id}`)).json();
    expect(mine).toHaveLength(1);
    expect(mine[0].providerId).toBe(a.id);
  });
});
