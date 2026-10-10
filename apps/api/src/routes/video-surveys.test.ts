import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { siteVisitMode } from '@dimol/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DemolitionEstimateStore } from '../demolition/store.js';
import { RequestStore } from '../requests/store.js';
import { MockVideoProvider } from '../video-survey/provider.js';
import { VideoSurveyService } from '../video-survey/service.js';
import { VideoSurveyStore } from '../video-survey/store.js';
import { createVideoSurveyRouter } from './video-surveys.js';

/**
 * 영상통화 실사를 실제 서버로 끝까지 돌린다(목 공급자 — 네트워크 없음).
 * 입장 링크는 곧 현장 내부를 보는 열쇠라, 당사자·시간 밖에서는 절대 나가면 안 된다.
 */

let server: Server | undefined;
let base: string;
let requestStore: RequestStore;
let estimates: DemolitionEstimateStore;
let video: MockVideoProvider;
let notices: Array<{ userId: string; message: string }>;
let now: Date;
let actingUserId = '';

const T1 = '2026-10-11T05:00:00.000Z';
const T2 = '2026-10-12T05:00:00.000Z';

beforeEach(async () => {
  now = new Date('2026-10-10T00:00:00.000Z');
  requestStore = new RequestStore();
  estimates = new DemolitionEstimateStore(requestStore);
  video = new MockVideoProvider();
  notices = [];
  const service = new VideoSurveyService({
    store: new VideoSurveyStore(),
    requestStore,
    video,
    involvedProviders: async (requestId) =>
      (await estimates.listByRequest(requestId))
        .filter((e) => e.stage !== 'DECLINED')
        .map((e) => ({ providerId: e.providerId, estimateId: e.id, providerName: e.providerName })),
    remoteVisit: {
      link: async (id, requesterId, at, sessionId) => {
        await estimates.attachVideoSession(id, requesterId, at, sessionId);
      },
      unlink: (id, sessionId) => estimates.detachVideoSession(id, sessionId),
    },
    notify: (_requestId, userId, message) => {
      notices.push({ userId, message });
    },
    now: () => now,
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as { authUser?: unknown }).authUser = { id: actingUserId };
    next();
  });
  app.use('/api', createVideoSurveyRouter(service));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

const post = (path: string, body: unknown = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** 요청자 'buyer' 의 철거 요청 + 업체 'p1' 의 개산 견적. */
async function setup() {
  const request = await requestStore.create({
    kind: 'DEMOLITION',
    requesterId: 'buyer',
    region: '양평',
    wasteCategory: 'CONSTRUCTION',
    wasteTons: 10,
    siteAddress: '양평읍 1',
  } as never);
  const estimate = await estimates.createPreliminary({
    requestId: request.id,
    providerId: 'p1',
    providerName: '대한철거',
    minAmount: 8_000_000,
    maxAmount: 12_000_000,
  });
  return { request, estimate };
}

async function scheduled() {
  const ctx = await setup();
  actingUserId = 'p1';
  const created = await (
    await post(`/api/requests/${ctx.request.id}/video-surveys`, { proposedAt: [T2, T1] })
  ).json();
  actingUserId = 'buyer';
  const accepted = await post(`/api/video-surveys/${created.id}/accept`, { scheduledAt: T1 });
  expect(accepted.status).toBe(200);
  return { ...ctx, sessionId: created.id as string };
}

describe('요청 → 예약', () => {
  it('견적을 낸 업체가 시간을 제안하고 요청자가 고른다 → 견적 실사가 원격으로 기록', async () => {
    const { request, estimate } = await setup();
    actingUserId = 'p1';
    const res = await post(`/api/requests/${request.id}/video-surveys`, { proposedAt: [T2, T1] });
    expect(res.status).toBe(201);
    const session = await res.json();
    expect(session.status).toBe('REQUESTED');
    expect(session.proposedAt).toEqual([T1, T2]);
    expect(session.estimateId).toBe(estimate.id);
    expect(notices.at(-1)?.userId).toBe('buyer');

    actingUserId = 'buyer';
    const accepted = await (
      await post(`/api/video-surveys/${session.id}/accept`, { scheduledAt: T1 })
    ).json();
    expect(accepted.status).toBe('SCHEDULED');
    expect(accepted.scheduledAt).toBe(T1);
    expect(notices.at(-1)?.userId).toBe('p1');

    const linked = await estimates.get(estimate.id);
    expect(linked?.stage).toBe('VISIT_SCHEDULED');
    expect(siteVisitMode(linked?.visit)).toBe('REMOTE');
    expect(linked?.visit?.videoSessionId).toBe(session.id);
  });

  it('견적을 내지 않은 업체·요청자 본인은 통화를 요청할 수 없다', async () => {
    const { request } = await setup();
    for (const who of ['stranger', 'buyer']) {
      actingUserId = who;
      const res = await post(`/api/requests/${request.id}/video-surveys`, { proposedAt: [T1] });
      expect(res.status).toBe(403);
    }
  });

  it('같은 업체가 열린 요청을 두 개 만들지 못한다', async () => {
    const { request } = await setup();
    actingUserId = 'p1';
    await post(`/api/requests/${request.id}/video-surveys`, { proposedAt: [T1] });
    const again = await post(`/api/requests/${request.id}/video-surveys`, { proposedAt: [T2] });
    expect(again.status).toBe(409);
  });

  it('제안되지 않은 시간은 고를 수 없고, 업체는 시간을 고를 수 없다', async () => {
    const { request } = await setup();
    actingUserId = 'p1';
    const s = await (
      await post(`/api/requests/${request.id}/video-surveys`, { proposedAt: [T1] })
    ).json();
    expect((await post(`/api/video-surveys/${s.id}/accept`, { scheduledAt: T1 })).status).toBe(403);
    actingUserId = 'buyer';
    expect((await post(`/api/video-surveys/${s.id}/accept`, { scheduledAt: T2 })).status).toBe(400);
  });

  it('업체는 자기 세션만, 요청자는 전부 본다 + 테스트 모드 표시', async () => {
    const { request } = await scheduled();
    actingUserId = 'buyer';
    const mine = await (await fetch(`${base}/api/requests/${request.id}/video-surveys`)).json();
    expect(mine.sessions).toHaveLength(1);
    expect(mine.testMode).toBe(true);
    expect(mine.sessions[0].room).toBeUndefined();
    actingUserId = 'p2';
    const other = await (await fetch(`${base}/api/requests/${request.id}/video-surveys`)).json();
    expect(other.sessions).toHaveLength(0);
  });
});

describe('입장', () => {
  it('입장 시간 전에는 링크를 주지 않는다', async () => {
    const { sessionId } = await scheduled();
    actingUserId = 'buyer';
    expect((await post(`/api/video-surveys/${sessionId}/join`)).status).toBe(409);
  });

  it('입장 시간 안 — 두 당사자에게 각각 링크, 첫 입장에 LIVE + 상대에게 알림', async () => {
    const { sessionId } = await scheduled();
    now = new Date(Date.parse(T1) - 5 * 60_000);
    actingUserId = 'p1';
    const res = await post(`/api/video-surveys/${sessionId}/join`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const joined = await res.json();
    expect(joined.testMode).toBe(true);
    expect(joined.url).toContain('.invalid');
    expect(joined.session.status).toBe('LIVE');
    expect(notices.at(-1)).toMatchObject({ userId: 'buyer' });

    actingUserId = 'buyer';
    const second = await (await post(`/api/video-surveys/${sessionId}/join`)).json();
    expect(second.url).toContain('role=requester');
  });

  it('제3자는 입장 시간 안이어도 거부', async () => {
    const { sessionId } = await scheduled();
    now = new Date(T1);
    actingUserId = 'stranger';
    expect((await post(`/api/video-surveys/${sessionId}/join`)).status).toBe(403);
  });

  it('입장 시간이 지나면 거부', async () => {
    const { sessionId } = await scheduled();
    now = new Date(Date.parse(T1) + 31 * 60_000);
    actingUserId = 'buyer';
    expect((await post(`/api/video-surveys/${sessionId}/join`)).status).toBe(409);
  });
});

describe('종료·취소', () => {
  it('종료하면 통화 시간이 남고 방이 지워진다', async () => {
    const { sessionId } = await scheduled();
    now = new Date(T1);
    actingUserId = 'p1';
    await post(`/api/video-surveys/${sessionId}/join`);
    now = new Date(Date.parse(T1) + 12 * 60_000);
    const ended = await (await post(`/api/video-surveys/${sessionId}/end`)).json();
    expect(ended.status).toBe('ENDED');
    expect(ended.durationSec).toBe(12 * 60);
    expect(video.deleted).toHaveLength(1);
  });

  it('들어온 적 없는 통화는 종료할 수 없다', async () => {
    const { sessionId } = await scheduled();
    actingUserId = 'p1';
    expect((await post(`/api/video-surveys/${sessionId}/end`)).status).toBe(409);
  });

  it('예약 취소 → 견적의 원격 실사도 풀린다(자리 반납)', async () => {
    const { sessionId, estimate } = await scheduled();
    actingUserId = 'p1';
    const res = await post(`/api/video-surveys/${sessionId}/cancel`);
    expect((await res.json()).status).toBe('CANCELLED');
    const reverted = await estimates.get(estimate.id);
    expect(reverted?.visit).toBeUndefined();
    expect(reverted?.stage).toBe('PRELIMINARY');
    expect(notices.at(-1)).toMatchObject({ userId: 'buyer' });
  });

  it('방문 실사가 이미 있으면 방식은 그대로 두고 통화 id 만 붙였다 뗀다', async () => {
    const { request, estimate } = await setup();
    await estimates.scheduleVisit(estimate.id, 'buyer', '2026-10-15T01:00:00.000Z');
    actingUserId = 'p1';
    const s = await (
      await post(`/api/requests/${request.id}/video-surveys`, { proposedAt: [T1] })
    ).json();
    actingUserId = 'buyer';
    await post(`/api/video-surveys/${s.id}/accept`, { scheduledAt: T1 });
    const linked = await estimates.get(estimate.id);
    expect(siteVisitMode(linked?.visit)).toBe('IN_PERSON');
    expect(linked?.visit?.videoSessionId).toBe(s.id);

    await post(`/api/video-surveys/${s.id}/cancel`);
    const after = await estimates.get(estimate.id);
    expect(after?.visit?.scheduledAt).toBe('2026-10-15T01:00:00.000Z');
    expect(after?.visit?.videoSessionId).toBeUndefined();
  });
});
