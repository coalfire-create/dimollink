import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PILOT } from '@dimol/shared';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionTokenStore } from '../auth/session-store.js';
import { createRequireAuth } from '../middleware/auth.js';
import { RequestStore } from '../requests/store.js';
import { UserStore } from '../users/store.js';
import { createJobsRouter } from './jobs.js';

// 체크섬 통과 사업자번호 (실존 업체와 무관).
const BIZ_A = '1208147521';
const BIZ_B = '1234567891';

let server: Server;
let base: string;
let requestStore: RequestStore;
let userStore: UserStore;
let sessionStore: SessionTokenStore;

/** 회원 id 로 세션 토큰 발급(인증 헤더용). */
const tokenOf = (userId: string) => sessionStore.issue(userId);

beforeEach(async () => {
  requestStore = new RequestStore();
  userStore = new UserStore();
  sessionStore = new SessionTokenStore();
  const app = express();
  app.use(express.json());
  // 일감 라우트는 인증 필요 — 실제 앱과 동일하게 미들웨어를 건다.
  app.use('/api/jobs', createRequireAuth(sessionStore, userStore));
  app.use('/api', createJobsRouter(requestStore, userStore));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

/** 승인된 운반업체 생성 (콜대기 상태 지정). */
async function makeTransport(availability: 'ONLINE' | 'OFFLINE', phone: string, biz = BIZ_A) {
  const u = await userStore.create({
    userType: 'TRANSPORT_COMPANY',
    name: '운반사',
    region: PILOT.region,
    phone,
    businessNumber: biz,
  });
  await userStore.setApprovalStatus(u.id, 'APPROVED');
  await userStore.setAvailability(u.id, availability);
  return (await userStore.get(u.id))!;
}

function makeTransportRequest(requesterId = 'consumer-1') {
  return requestStore.create({
    kind: 'TRANSPORT',
    requesterId,
    region: PILOT.region,
    wasteCategory: PILOT.wasteCategory,
    wasteTons: 3,
    allbaroRequested: false,
    loadAddress: '양평읍 상차지',
    unloadAddress: '양평읍 하차지',
  });
}

const getJobs = async (providerId: string) =>
  fetch(`${base}/api/jobs`, {
    headers: { authorization: `Bearer ${await tokenOf(providerId)}` },
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

const accept = async (requestId: string, providerId: string, amount?: number) =>
  fetch(`${base}/api/jobs/${requestId}/accept`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${await tokenOf(providerId)}`,
    },
    body: JSON.stringify(amount !== undefined ? { amount } : {}),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

describe('업체 일감 피드 (/api/jobs)', () => {
  it('콜대기 ON 운반업체는 새 운반요청을 open 으로 받고, 수락하면 assigned 로 이동', async () => {
    const t = await makeTransport('ONLINE', '01020000001');
    const req = await makeTransportRequest();

    const before = await getJobs(t.id);
    expect(before.body.open).toHaveLength(1);
    expect(before.body.assigned).toHaveLength(0);

    const accepted = await accept(req.id, t.id);
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('MATCHED');
    expect(accepted.body.matchedProviderId).toBe(t.id);

    const after = await getJobs(t.id);
    expect(after.body.open).toHaveLength(0);
    expect(after.body.assigned).toHaveLength(1);
  });

  it('콜대기 OFF면 open 이 비고 수락도 막힌다(409)', async () => {
    const t = await makeTransport('OFFLINE', '01020000002');
    const req = await makeTransportRequest();

    expect((await getJobs(t.id)).body.open).toHaveLength(0);
    const res = await accept(req.id, t.id);
    expect(res.status).toBe(409);
  });

  it('업종이 맞지 않는 일감은 수락 불가(403)', async () => {
    const plant = await userStore.create({
      userType: 'WASTE_TREATMENT_PLANT',
      name: '처리장',
      region: PILOT.region,
      phone: '01020000003',
      businessNumber: BIZ_B,
    });
    await userStore.setApprovalStatus(plant.id, 'APPROVED');
    const transportReq = await makeTransportRequest();
    const res = await accept(transportReq.id, plant.id);
    expect(res.status).toBe(403);
  });

  it('이미 수락된 일감은 다른 업체가 수락할 수 없다(409)', async () => {
    const t1 = await makeTransport('ONLINE', '01020000004', BIZ_A);
    const t2 = await makeTransport('ONLINE', '01020000005', BIZ_B);
    const req = await makeTransportRequest();
    expect((await accept(req.id, t1.id)).status).toBe(200);
    expect((await accept(req.id, t2.id)).status).toBe(409);
  });

  it('미승인(PENDING) 업체는 수락 불가(403)', async () => {
    const u = await userStore.create({
      userType: 'TRANSPORT_COMPANY',
      name: '미승인운반',
      region: PILOT.region,
      phone: '01020000006',
      businessNumber: BIZ_A,
    });
    await userStore.setAvailability(u.id, 'ONLINE');
    const req = await makeTransportRequest();
    expect((await accept(req.id, u.id)).status).toBe(403);
  });

  it('금액과 함께 수락하면 합의 금액(agreedFee)이 기록된다', async () => {
    const t = await makeTransport('ONLINE', '01020000009');
    const req = await makeTransportRequest();
    const res = await accept(req.id, t.id, 150000);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('MATCHED');
    expect(res.body.agreedFee).toBe(150000);
  });

  it('음수/0 금액 수락은 400', async () => {
    const t = await makeTransport('ONLINE', '01020000010');
    const req = await makeTransportRequest();
    expect((await accept(req.id, t.id, 0)).status).toBe(400);
  });

  it('토큰 없이 피드 조회는 401', async () => {
    const res = await fetch(`${base}/api/jobs`);
    expect(res.status).toBe(401);
  });

  it('소비자 등 일감 대상이 아닌 유형은 피드 조회 400', async () => {
    const consumer = await userStore.create({
      userType: 'CONSUMER',
      name: '김소비',
      region: PILOT.region,
      phone: '01020000007',
    });
    expect((await getJobs(consumer.id)).status).toBe(400);
  });

  it('업체 좌표 기준 가까운 일감이 먼저 오고 distanceKm 가 붙는다(반경 30km 밖은 제외)', async () => {
    // 운반업체 기준 좌표.
    const t = await userStore.create({
      userType: 'TRANSPORT_COMPANY',
      name: '운반사',
      region: PILOT.region,
      phone: '01020000008',
      businessNumber: BIZ_A,
      location: { lat: 37.49, lng: 127.49 },
    });
    await userStore.setApprovalStatus(t.id, 'APPROVED');
    await userStore.setAvailability(t.id, 'ONLINE');

    // 반경 30km 밖(약 36km) — 운반업체 콜 피드에서 제외되어야 한다.
    const outOfRangeReq = await requestStore.create({
      kind: 'TRANSPORT',
      requesterId: 'consumer-0',
      region: PILOT.region,
      wasteCategory: PILOT.wasteCategory,
      wasteTons: 3,
      allbaroRequested: false,
      loadAddress: '반경 밖 상차지',
      unloadAddress: '하차지',
      location: { lat: 37.7, lng: 127.8 },
    });
    const farReq = await requestStore.create({
      kind: 'TRANSPORT',
      requesterId: 'consumer-1',
      region: PILOT.region,
      wasteCategory: PILOT.wasteCategory,
      wasteTons: 3,
      allbaroRequested: false,
      loadAddress: '먼 상차지',
      unloadAddress: '하차지',
      location: { lat: 37.6, lng: 127.6 },
    });
    const nearReq = await requestStore.create({
      kind: 'TRANSPORT',
      requesterId: 'consumer-2',
      region: PILOT.region,
      wasteCategory: PILOT.wasteCategory,
      wasteTons: 3,
      allbaroRequested: false,
      loadAddress: '가까운 상차지',
      unloadAddress: '하차지',
      location: { lat: 37.49, lng: 127.49 },
    });

    const { body } = await getJobs(t.id);
    // 반경 30km 이내만, 가까운 순으로. 반경 밖(outOfRangeReq)은 노출되지 않는다.
    expect(body.open.map((j: { id: string }) => j.id)).toEqual([nearReq.id, farReq.id]);
    expect(body.open.some((j: { id: string }) => j.id === outOfRangeReq.id)).toBe(false);
    expect(body.open[0].distanceKm).toBe(0);
    expect(body.open[1].distanceKm).toBeGreaterThan(0);
  });

  it('운반업체가 설정한 매칭 반경(matchRadiusKm)이 피드 조회와 수락 모두에 동일하게 적용된다', async () => {
    const t = await userStore.create({
      userType: 'TRANSPORT_COMPANY',
      name: '광역운반',
      region: PILOT.region,
      phone: '01020000018',
      businessNumber: BIZ_A,
      location: { lat: 37.49, lng: 127.49 },
    });
    await userStore.setApprovalStatus(t.id, 'APPROVED');
    // 반경 50km 로 확대 설정
    await userStore.setAvailability(t.id, 'ONLINE', 50);

    // 약 36km 거리(기본 30km 밖이지만 50km 안)
    const req36km = await requestStore.create({
      kind: 'TRANSPORT',
      requesterId: 'consumer-36',
      region: PILOT.region,
      wasteCategory: PILOT.wasteCategory,
      wasteTons: 3,
      allbaroRequested: false,
      loadAddress: '36km 상차지',
      unloadAddress: '하차지',
      location: { lat: 37.7, lng: 127.8 },
    });

    const { body } = await getJobs(t.id);
    expect(body.open.some((j: { id: string }) => j.id === req36km.id)).toBe(true);

    // 피드에서 보인 일감은 수락도 200 으로 통과해야 한다
    const accepted = await accept(req36km.id, t.id, 180_000);
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('MATCHED');
  });
});

describe('철거는 선착순 수주가 막혀 있다', () => {
  /**
   * 화면에서 버튼을 없애는 것만으로는 부족하다 — 옛 경로가 열려 있으면 3단계 견적을
   * 건너뛰고 사진만 보고 낸 금액으로 계약이 굳는다.
   */
  it('철거 요청은 /jobs/:id/accept 로 수주할 수 없다', async () => {
    const company = await userStore.create({
      userType: 'DEMOLITION_COMPANY',
      name: '대한철거',
      region: PILOT.region,
      phone: '01099990001',
      businessNumber: BIZ_B,
    });
    await userStore.setApprovalStatus(company.id, 'APPROVED');
    const request = await requestStore.create({
      kind: 'DEMOLITION',
      requesterId: 'consumer-1',
      region: PILOT.region,
      wasteCategory: PILOT.wasteCategory,
      wasteTons: 10,
      allbaroRequested: false,
      siteAddress: '양평읍 1',
    });

    const res = await fetch(`${base}/api/jobs/${request.id}/accept`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${await tokenOf(company.id)}`,
      },
      body: JSON.stringify({ amount: 8_000_000 }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('DEMOLITION_REQUIRES_ESTIMATE_FLOW');
  });
});
