import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import {
  REMOTE_SURVEY_ITEMS,
  REMOTE_SURVEY_MAX_OPEN_SHOT_REQUESTS_PER_PROVIDER,
  REQUIRED_ROOM_SLOTS,
  remoteSurveyProviderIds,
} from '@dimol/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DemolitionEstimateStore } from '../demolition/store.js';
import { RemoteSurveyShotRequestStore } from '../remote-survey/shot-request-store.js';
import { RemoteSurveyStore } from '../remote-survey/store.js';
import { RequestStore } from '../requests/store.js';
import { createRemoteSurveyRouter } from './remote-surveys.js';

/**
 * 원격 실사 패키지를 실제 서버로 끝까지 돌린다 — 만들기 → 찍기 → 제출 → 업체 열람 →
 * 추가 촬영 요청 → 찍어서 보내기. 남의 집 내부 사진이라 권한이 새면 안 된다.
 */

let server: Server | undefined;
let base: string;
let requestStore: RequestStore;
let estimates: DemolitionEstimateStore;
let notifications: { userId: string; message: string }[];
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
  estimates = new DemolitionEstimateStore(requestStore);
  notifications = [];
  const notify = (_requestId: string, userId: string, message: string) => {
    notifications.push({ userId, message });
  };
  // app.ts 와 같은 배선 — 참여 업체는 견적 저장소에서 가져온다.
  const surveys = new RemoteSurveyStore(
    requestStore,
    async (requestId) =>
      remoteSurveyProviderIds(
        await estimates.listByRequest(requestId),
        (await requestStore.get(requestId))?.matchedProviderId,
      ),
    undefined,
    notify,
  );
  const shots = new RemoteSurveyShotRequestStore(surveys, undefined, notify);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as { authUser?: unknown }).authUser = { id: actingUserId };
    next();
  });
  app.use('/api', createRemoteSurveyRouter(surveys, shots));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
});

const call = (method: string, path: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

let keySeq = 0;
function key(): string {
  keySeq += 1;
  return `site-photos/demolition-request/00000000-0000-4000-8000-${keySeq.toString(16).padStart(12, '0')}.jpg`;
}
const keys = (n: number) => Array.from({ length: n }, key);

async function demolitionRequest(requesterId: string, kind = 'DEMOLITION') {
  return requestStore.create({
    kind,
    requesterId,
    region: '양평',
    wasteCategory: 'CONSTRUCTION',
    wasteTons: 10,
    siteAddress: '양평읍 1',
    loadAddress: '양평읍 1',
    unloadAddress: '양평읍 2',
  } as never);
}

/** 업체를 이 요청의 개산 견적 참여자로 만든다. */
async function joinEstimate(requestId: string, providerId: string) {
  return estimates.createPreliminary({
    requestId,
    providerId,
    providerName: providerId,
    minAmount: 8_000_000,
    maxAmount: 12_000_000,
  });
}

/** 필수를 모두 채우는 PATCH 본문. */
function completeBody() {
  const items: Record<string, string[]> = {};
  for (const item of REMOTE_SURVEY_ITEMS) {
    if (item.requirement === 'REQUIRED' && item.capture !== 'ROOMS')
      items[item.id] = keys(item.minPhotos);
  }
  return {
    rooms: [
      { name: '거실', photoKeys: Object.fromEntries(REQUIRED_ROOM_SLOTS.map((s) => [s, [key()]])) },
    ],
    items,
    answers: {
      basement: 'NO',
      floorsAboveGround: 1,
      roofType: 'SLATE',
      knownAsbestos: 'UNKNOWN',
      buildingEmpty: true,
      accessWidth: 'UNDER_2M',
    },
  };
}

/** 소비자가 패키지를 만들고 다 채워서 보낸다. */
async function submittedSurvey(requesterId: string, requestId: string) {
  actingUserId = requesterId;
  const created = await (await call('POST', '/api/remote-surveys', { requestId })).json();
  await call('PATCH', `/api/remote-surveys/${created.id}`, completeBody());
  const res = await call('POST', `/api/remote-surveys/${created.id}/submit`);
  expect(res.status).toBe(200);
  return res.json();
}

describe('만들기', () => {
  it('본인 철거 요청에 만들고, 두 번 눌러도 하나다', async () => {
    const request = await demolitionRequest('buyer');
    actingUserId = 'buyer';
    const first = await call('POST', '/api/remote-surveys', { requestId: request.id });
    expect(first.status).toBe(201);
    const body = await first.json();
    expect(body).toMatchObject({ status: 'DRAFT', requesterId: 'buyer', rooms: [] });

    const again = await call('POST', '/api/remote-surveys', { requestId: request.id });
    expect(again.status).toBe(200);
    expect((await again.json()).id).toBe(body.id);
  });

  it('남의 요청·철거가 아닌 요청에는 만들 수 없다', async () => {
    const request = await demolitionRequest('buyer');
    actingUserId = 'stranger';
    expect((await call('POST', '/api/remote-surveys', { requestId: request.id })).status).toBe(403);

    const transport = await demolitionRequest('buyer', 'TRANSPORT');
    actingUserId = 'buyer';
    expect((await call('POST', '/api/remote-surveys', { requestId: transport.id })).status).toBe(
      400,
    );
    expect((await call('POST', '/api/remote-surveys', { requestId: 'nope' })).status).toBe(404);
  });
});

describe('작성·제출', () => {
  it('필수가 남아 있으면 제출이 거부되고, 다 채우면 참여 업체에게 알림이 간다', async () => {
    const request = await demolitionRequest('buyer');
    await joinEstimate(request.id, 'p1');
    actingUserId = 'buyer';
    const survey = await (
      await call('POST', '/api/remote-surveys', { requestId: request.id })
    ).json();

    const early = await call('POST', `/api/remote-surveys/${survey.id}/submit`);
    expect(early.status).toBe(400);
    expect((await early.json()).error).toContain('남은 항목');

    const patched = await call('PATCH', `/api/remote-surveys/${survey.id}`, completeBody());
    expect(patched.status).toBe(200);
    const saved = await patched.json();
    expect(saved.rooms[0].id).toBeTruthy(); // 서버가 방 id 를 붙인다

    notifications = [];
    const done = await call('POST', `/api/remote-surveys/${survey.id}/submit`);
    expect(done.status).toBe(200);
    expect((await done.json()).status).toBe('SUBMITTED');
    expect(notifications.map((n) => n.userId)).toEqual(['p1']);

    // 보낸 뒤에는 고칠 수 없다 — 빠진 것은 추가 촬영 요청으로 채운다.
    const late = await call('PATCH', `/api/remote-surveys/${survey.id}`, { answers: {} });
    expect(late.status).toBe(409);
  });

  it('잘못된 입력은 400, 남의 자료는 403', async () => {
    const request = await demolitionRequest('buyer');
    actingUserId = 'buyer';
    const survey = await (
      await call('POST', '/api/remote-surveys', { requestId: request.id })
    ).json();

    const badKey = await call('PATCH', `/api/remote-surveys/${survey.id}`, {
      items: { ROOF: ['https://elsewhere.example/x.jpg'] },
    });
    expect(badKey.status).toBe(400);
    const badAnswer = await call('PATCH', `/api/remote-surveys/${survey.id}`, {
      answers: { floorsAboveGround: -1 },
    });
    expect(badAnswer.status).toBe(400);
    const badScan = await call('PATCH', `/api/remote-surveys/${survey.id}`, { scanJobId: '../x' });
    expect(badScan.status).toBe(400);

    const scan = await call('PATCH', `/api/remote-surveys/${survey.id}`, { scanJobId: 'job-123' });
    expect((await scan.json()).scanJobId).toBe('job-123');
    const cleared = await call('PATCH', `/api/remote-surveys/${survey.id}`, { scanJobId: null });
    expect((await cleared.json()).scanJobId).toBeUndefined();

    actingUserId = 'stranger';
    const other = await call('PATCH', `/api/remote-surveys/${survey.id}`, { answers: {} });
    expect(other.status).toBe(403);
  });
});

describe('열람 권한', () => {
  it('소비자는 작성 중에도 보고, 참여 업체는 제출된 것만, 남은 못 본다', async () => {
    const request = await demolitionRequest('buyer');
    await joinEstimate(request.id, 'p1');
    actingUserId = 'buyer';
    await call('POST', '/api/remote-surveys', { requestId: request.id });

    expect((await call('GET', `/api/remote-surveys?requestId=${request.id}`)).status).toBe(200);
    actingUserId = 'p1';
    expect((await call('GET', `/api/remote-surveys?requestId=${request.id}`)).status).toBe(404);

    await submittedSurvey('buyer', request.id);
    actingUserId = 'p1';
    const seen = await call('GET', `/api/remote-surveys?requestId=${request.id}`);
    expect(seen.status).toBe(200);
    expect((await seen.json()).answers.roofType).toBe('SLATE');

    actingUserId = 'stranger';
    expect((await call('GET', `/api/remote-surveys?requestId=${request.id}`)).status).toBe(403);
  });

  it('떨어진(DECLINED) 업체는 더 이상 못 본다', async () => {
    const request = await demolitionRequest('buyer');
    const loser = await joinEstimate(request.id, 'p2');
    await submittedSurvey('buyer', request.id);
    // 다른 업체가 선정되면 견적이 DECLINED 로 닫힌다.
    const persisted = await estimates.get(loser.id);
    (persisted as { stage: string }).stage = 'DECLINED';
    actingUserId = 'p2';
    expect((await call('GET', `/api/remote-surveys?requestId=${request.id}`)).status).toBe(403);
  });
});

describe('추가 촬영 요청', () => {
  it('참여 업체가 요청 → 소비자 알림 → 소비자가 찍어 보내기 → 업체 알림', async () => {
    const request = await demolitionRequest('buyer');
    await joinEstimate(request.id, 'p1');
    await joinEstimate(request.id, 'p2');
    const survey = await submittedSurvey('buyer', request.id);

    actingUserId = 'p1';
    notifications = [];
    const created = await call('POST', `/api/remote-surveys/${survey.id}/shot-requests`, {
      itemId: 'WALL_SECTION',
      message: '줄자를 대고 벽 두께를 다시 찍어 주세요',
    });
    expect(created.status).toBe(201);
    const shot = await created.json();
    expect(shot).toMatchObject({ status: 'OPEN', itemId: 'WALL_SECTION', providerId: 'p1' });
    expect(notifications).toEqual([
      { userId: 'buyer', message: expect.stringContaining('벽 두께') },
    ]);

    // 밀봉 — 다른 업체는 p1 의 요청을 못 본다. 소비자는 본다.
    actingUserId = 'p2';
    expect(
      await (await call('GET', `/api/remote-surveys/${survey.id}/shot-requests`)).json(),
    ).toEqual([]);
    actingUserId = 'buyer';
    const mine = await (await call('GET', `/api/remote-surveys/${survey.id}/shot-requests`)).json();
    expect(mine).toHaveLength(1);

    // 업체가 대신 보낼 수는 없다.
    actingUserId = 'p1';
    expect(
      (
        await call('POST', `/api/remote-surveys/shot-requests/${shot.id}/fulfil`, {
          photoKeys: keys(1),
        })
      ).status,
    ).toBe(403);

    actingUserId = 'buyer';
    expect(
      (await call('POST', `/api/remote-surveys/shot-requests/${shot.id}/fulfil`, { photoKeys: [] }))
        .status,
    ).toBe(400);
    notifications = [];
    const photos = keys(2);
    const done = await call('POST', `/api/remote-surveys/shot-requests/${shot.id}/fulfil`, {
      photoKeys: photos,
    });
    expect(done.status).toBe(200);
    expect(await done.json()).toMatchObject({ status: 'FULFILLED', photoKeys: photos });
    expect(notifications.map((n) => n.userId)).toEqual(['p1']);

    const again = await call('POST', `/api/remote-surveys/shot-requests/${shot.id}/fulfil`, {
      photoKeys: keys(1),
    });
    expect(again.status).toBe(409);
  });

  it('참여하지 않은 업체·제출 전 자료·상한 초과는 거부된다', async () => {
    const request = await demolitionRequest('buyer');
    await joinEstimate(request.id, 'p1');
    actingUserId = 'buyer';
    const draft = await (
      await call('POST', '/api/remote-surveys', { requestId: request.id })
    ).json();

    actingUserId = 'p1';
    const tooEarly = await call('POST', `/api/remote-surveys/${draft.id}/shot-requests`, {
      message: '지붕 더',
    });
    expect(tooEarly.status).toBe(409);

    await submittedSurvey('buyer', request.id);
    actingUserId = 'outsider';
    expect(
      (await call('POST', `/api/remote-surveys/${draft.id}/shot-requests`, { message: 'x' }))
        .status,
    ).toBe(403);

    actingUserId = 'p1';
    expect(
      (await call('POST', `/api/remote-surveys/${draft.id}/shot-requests`, { message: '  ' }))
        .status,
    ).toBe(400);
    expect(
      (
        await call('POST', `/api/remote-surveys/${draft.id}/shot-requests`, {
          itemId: 'GARDEN',
          message: 'x',
        })
      ).status,
    ).toBe(400);
    for (let i = 0; i < REMOTE_SURVEY_MAX_OPEN_SHOT_REQUESTS_PER_PROVIDER; i += 1) {
      const ok = await call('POST', `/api/remote-surveys/${draft.id}/shot-requests`, {
        message: `요청 ${i}`,
      });
      expect(ok.status).toBe(201);
    }
    const over = await call('POST', `/api/remote-surveys/${draft.id}/shot-requests`, {
      message: '하나 더',
    });
    expect(over.status).toBe(409);
  });
});
