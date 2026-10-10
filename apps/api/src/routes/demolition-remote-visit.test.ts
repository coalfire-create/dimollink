import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { RemoteSurvey } from '@dimol/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RemoteSiteVisitService } from '../demolition/remote-visit.js';
import { DemolitionEstimateStore } from '../demolition/store.js';
import { RequestStore } from '../requests/store.js';
import { UserStore } from '../users/store.js';
import { createDemolitionEstimateRouter } from './demolition-estimates.js';

/**
 * 원격 실사로 진행 — 실제 서버로 돌린다.
 * 이 기록이 정합성 표본([[estimate-parity]])의 원격/방문 구분이 되므로, 남의 견적을 바꾸거나
 * 반쪽 자료로 원격이라고 남기거나, 방문 실사 흐름이 달라지면 안 된다.
 */

let server: Server | undefined;
let base: string;
let requestStore: RequestStore;
let store: DemolitionEstimateStore;
/** 요청별 원격 실사 패키지 — 저장소 대신 테스트가 직접 넣는다. */
let surveys: Map<string, RemoteSurvey>;
let notices: { userId: string; message: string }[];
let actingUserId = '';

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

beforeEach(async () => {
  requestStore = new RequestStore();
  store = new DemolitionEstimateStore(requestStore);
  surveys = new Map();
  notices = [];
  const service = new RemoteSiteVisitService({
    estimates: store,
    surveyByRequest: async (requestId) => surveys.get(requestId),
    requesterOf: async (requestId) => (await requestStore.get(requestId))?.requesterId,
    notify: (_requestId, userId, message) => {
      notices.push({ userId, message });
    },
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as { authUser?: unknown }).authUser = { id: actingUserId };
    next();
  });
  app.use('/api', createDemolitionEstimateRouter(store, requestStore, new UserStore(), service));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
});

const post = (path: string, body: unknown = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

let seq = 0;
async function setup(options: { submitted?: boolean; providers?: number } = {}) {
  seq += 1;
  const requesterId = `buyer-${seq}`;
  const request = await requestStore.create({
    kind: 'DEMOLITION',
    requesterId,
    region: '양평',
    wasteCategory: 'CONSTRUCTION',
    wasteTons: 10,
    siteAddress: '양평읍 1',
  } as never);
  const estimates = [];
  for (let i = 0; i < (options.providers ?? 1); i += 1) {
    estimates.push(
      await store.createPreliminary({
        requestId: request.id,
        providerId: `provider-${seq}-${i}`,
        providerName: `철거${i}`,
        minAmount: 8_000_000,
        maxAmount: 12_000_000,
      }),
    );
  }
  const survey: RemoteSurvey = {
    id: `survey-${seq}`,
    requestId: request.id,
    requesterId,
    status: options.submitted === false ? 'DRAFT' : 'SUBMITTED',
    rooms: [],
    items: {},
    answers: {},
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
  surveys.set(request.id, survey);
  return { request, requesterId, estimates, survey };
}

describe('POST /demolition-estimates/:id/remote-visit', () => {
  it('업체 본인이 제출된 자료로 원격 실사를 기록한다', async () => {
    const { estimates, survey } = await setup();
    const mine = estimates[0];
    actingUserId = mine.providerId;
    const res = await post(`/api/demolition-estimates/${mine.id}/remote-visit`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stage).toBe('VISIT_SCHEDULED');
    expect(body.visit.mode).toBe('REMOTE');
    expect(body.visit.remoteSurveyId).toBe(survey.id);
  });

  it('남의 견적은 바꿀 수 없다', async () => {
    const { estimates } = await setup();
    actingUserId = 'someone-else';
    const res = await post(`/api/demolition-estimates/${estimates[0].id}/remote-visit`);
    expect(res.status).toBe(400);
    expect((await store.get(estimates[0].id))?.visit).toBeUndefined();
  });

  it('소비자가 아직 안 보낸 자료로는 기록하지 않는다', async () => {
    const { estimates } = await setup({ submitted: false });
    actingUserId = estimates[0].providerId;
    const res = await post(`/api/demolition-estimates/${estimates[0].id}/remote-visit`);
    expect(res.status).toBe(400);
  });

  it('소비자가 잡은 방문 실사는 일시를 두고 원격으로 바꾸며 소비자에게 알린다', async () => {
    const { estimates, requesterId, survey } = await setup();
    const mine = estimates[0];
    await store.scheduleVisit(mine.id, requesterId, '2026-10-20T01:00:00.000Z');
    actingUserId = mine.providerId;
    const body = await (await post(`/api/demolition-estimates/${mine.id}/remote-visit`)).json();
    expect(body.visit).toMatchObject({
      scheduledAt: '2026-10-20T01:00:00.000Z',
      mode: 'REMOTE',
      remoteSurveyId: survey.id,
    });
    expect(notices.some((n) => n.userId === requesterId)).toBe(true);
  });

  it('두 번 눌러도 한 번만 알린다', async () => {
    const { estimates, requesterId } = await setup();
    await store.scheduleVisit(estimates[0].id, requesterId, '2026-10-20T01:00:00.000Z');
    actingUserId = estimates[0].providerId;
    await post(`/api/demolition-estimates/${estimates[0].id}/remote-visit`);
    await post(`/api/demolition-estimates/${estimates[0].id}/remote-visit`);
    expect(notices.filter((n) => n.userId === requesterId)).toHaveLength(1);
  });

  it('실사 업체가 다 찼으면 새로 잡지 않는다', async () => {
    const { estimates, requesterId } = await setup({ providers: 4 });
    for (const e of estimates.slice(0, 3)) {
      await store.scheduleVisit(e.id, requesterId, '2026-10-20T01:00:00.000Z');
    }
    actingUserId = estimates[3].providerId;
    const res = await post(`/api/demolition-estimates/${estimates[3].id}/remote-visit`);
    expect(res.status).toBe(400);
  });
});

describe('POST /demolition-estimates/:id/final  remote=true', () => {
  it('실사 없이도 원격 실사 자료 기준으로 확정하고 REMOTE 로 남는다', async () => {
    const { estimates, survey } = await setup();
    actingUserId = estimates[0].providerId;
    const res = await post(`/api/demolition-estimates/${estimates[0].id}/final`, {
      amount: 11_000_000,
      remote: true,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stage).toBe('FINAL');
    expect(body.visit.mode).toBe('REMOTE');
    expect(body.visit.remoteSurveyId).toBe(survey.id);
    expect(body.visit.completedAt).toBeTruthy();
  });

  it('금액이 틀리면 실사 기록도 바꾸지 않는다', async () => {
    const { estimates } = await setup();
    actingUserId = estimates[0].providerId;
    // 개산 상단 초과 + 사유 없음
    const res = await post(`/api/demolition-estimates/${estimates[0].id}/final`, {
      amount: 20_000_000,
      remote: true,
    });
    expect(res.status).toBe(400);
    expect((await store.get(estimates[0].id))?.visit).toBeUndefined();
  });

  it('remote 없이 내면 방문 실사 흐름 그대로다(실사 없으면 거부, 있으면 mode 없음)', async () => {
    const { estimates, requesterId } = await setup();
    const mine = estimates[0];
    actingUserId = mine.providerId;
    expect(
      (await post(`/api/demolition-estimates/${mine.id}/final`, { amount: 11_000_000 })).status,
    ).toBe(400);

    await store.scheduleVisit(mine.id, requesterId, '2026-10-20T01:00:00.000Z');
    const body = await (
      await post(`/api/demolition-estimates/${mine.id}/final`, { amount: 11_000_000 })
    ).json();
    expect(body.stage).toBe('FINAL');
    expect(body.visit.mode).toBeUndefined();
    expect(body.visit.remoteSurveyId).toBeUndefined();
  });

  it('확정 뒤에는 원격으로 바꿀 수 없다', async () => {
    const { estimates } = await setup();
    actingUserId = estimates[0].providerId;
    await post(`/api/demolition-estimates/${estimates[0].id}/final`, {
      amount: 11_000_000,
      remote: true,
    });
    const res = await post(`/api/demolition-estimates/${estimates[0].id}/remote-visit`);
    expect(res.status).toBe(400);
  });
});
