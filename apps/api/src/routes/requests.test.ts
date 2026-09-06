import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PILOT } from '@dimol/shared';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionTokenStore } from '../auth/session-store.js';
import { createRequireAuth } from '../middleware/auth.js';
import { RequestStore } from '../requests/store.js';
import { UserStore } from '../users/store.js';
import { createRequestsRouter } from './requests.js';

/**
 * 철거요청 접수 — 현장 상세(demolitionDetails) 보존.
 * 디몰비전 흐름에서 확인한 건축물대장·AI 분석은 요청과 함께 남아야 업체가 현장 전에 볼 수 있다.
 */

let server: Server;
let base: string;
let requestStore: RequestStore;
let userStore: UserStore;
let sessionStore: SessionTokenStore;

beforeEach(async () => {
  requestStore = new RequestStore();
  userStore = new UserStore();
  sessionStore = new SessionTokenStore();
  const app = express();
  app.use(express.json());
  app.use('/api/requests', createRequireAuth(sessionStore, userStore));
  app.use('/api', createRequestsRouter(requestStore));
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

async function consumerToken() {
  const user = await userStore.create({
    userType: 'CONSUMER',
    name: '김소비',
    region: PILOT.region,
    phone: '01099990001',
  });
  return sessionStore.issue(user.id);
}

async function postRequest(token: string, body: Record<string, unknown>) {
  const res = await fetch(`${base}/api/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const BASE_BODY = {
  kind: 'DEMOLITION',
  region: PILOT.region,
  wasteCategory: PILOT.wasteCategory,
  allbaroRequested: false,
  siteAddress: '경기 양평군 양평읍 양근리 120-5',
};

describe('POST /api/requests — 철거요청 현장 상세', () => {
  it('건축물대장·디몰비전 분석을 요청에 함께 저장한다', async () => {
    const token = await consumerToken();
    const { status, body } = await postRequest(token, {
      ...BASE_BODY,
      demolitionDetails: {
        buildingType: 'HOUSING',
        demolitionType: 'TOTAL',
        spaceSize: '27평',
        floorCount: '지상 2층 / 지하 1층',
        hasElevator: false,
        hasVehicleAccess: true,
        desiredDate: '2026-09-10',
        description: '슬레이트 지붕 포함 전체 철거',
        buildingLedger: {
          strctCdNm: '연와조',
          roofCdNm: '슬레이트',
          mainPurpsCdNm: '단독주택',
          grndFlrCnt: 2,
          ugrndFlrCnt: 1,
          totArea: 264.3,
          useAprDay: '19910415',
        },
        dimolVisionAnalysis: {
          summary: '연와조 2층 주택, 슬레이트 지붕 확인',
          hazards: ['석면 슬레이트 — 사전조사 전 철거 금지'],
          materials: ['적벽돌 조적벽'],
          confidence: 'MEDIUM',
          analyzedAt: '2026-08-30T00:00:00.000Z',
        },
      },
    });

    expect(status).toBe(201);
    expect(body.demolitionDetails.buildingType).toBe('HOUSING');
    expect(body.demolitionDetails.floorCount).toBe('지상 2층 / 지하 1층');
    expect(body.demolitionDetails.hasElevator).toBe(false);
    expect(body.demolitionDetails.buildingLedger).toMatchObject({
      strctCdNm: '연와조',
      roofCdNm: '슬레이트',
      useAprDay: '19910415',
      grndFlrCnt: 2,
      ugrndFlrCnt: 1,
      totArea: 264.3,
    });
    expect(body.demolitionDetails.dimolVisionAnalysis.hazards).toEqual([
      '석면 슬레이트 — 사전조사 전 철거 금지',
    ]);

    // 저장소에도 남아 업체 조회 시 그대로 보인다.
    const stored = await requestStore.get(body.id);
    expect(stored?.kind === 'DEMOLITION' && stored.demolitionDetails?.buildingLedger?.strctCdNm).toBe(
      '연와조',
    );
  });

  it('허용되지 않은 값·임의 필드는 버린다', async () => {
    const token = await consumerToken();
    const { body } = await postRequest(token, {
      ...BASE_BODY,
      demolitionDetails: {
        buildingType: 'CASTLE',
        demolitionType: 'NUKE',
        hasElevator: 'yes',
        evilField: '무시되어야 함',
        buildingLedger: { grndFlrCnt: 'many' },
      },
    });
    expect(body.demolitionDetails?.buildingType).toBeUndefined();
    expect(body.demolitionDetails?.demolitionType).toBeUndefined();
    expect(body.demolitionDetails?.hasElevator).toBeUndefined();
    expect(body.demolitionDetails?.evilField).toBeUndefined();
    expect(body.demolitionDetails?.buildingLedger).toBeUndefined();
  });

  it('현장 상세가 없으면 필드 자체를 만들지 않는다', async () => {
    const token = await consumerToken();
    const { status, body } = await postRequest(token, BASE_BODY);
    expect(status).toBe(201);
    expect(body.demolitionDetails).toBeUndefined();
  });
});
