import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DemolitionEstimate } from '@dimol/shared';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DemolitionEstimateStore } from '../demolition/store.js';
import {
  EstimateParityService,
  STALE_REASON_ESTIMATES_GONE,
  autoSampleId,
} from '../estimate-parity/service.js';
import { ParitySampleStore } from '../estimate-parity/store.js';
import type { CollectionPersistence } from '../lib/json-collection.js';
import { memoryPersistenceFactory } from '../lib/memory-persistence.js';
import { RequestStore } from '../requests/store.js';
import { createEstimateParityRouter } from './estimate-parity.js';

const ADMIN = 'test-admin-token';

let server: Server;
let base: string;
let requestStore: RequestStore;
let estimatePersistence: CollectionPersistence<DemolitionEstimate>;
let actualTons: Map<string, number>;
let sampleStore: ParitySampleStore;

beforeEach(async () => {
  requestStore = new RequestStore();
  estimatePersistence = memoryPersistenceFactory()<DemolitionEstimate>('demolition-estimates');
  actualTons = new Map();
  sampleStore = new ParitySampleStore();
  const service = new EstimateParityService(
    sampleStore,
    new DemolitionEstimateStore(requestStore, estimatePersistence),
    requestStore,
    async (requestId) => actualTons.get(requestId),
  );
  const app = express();
  app.use(express.json());
  app.use('/api', createEstimateParityRouter(service, ADMIN));
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

function call(method: string, path: string, body?: unknown, token = ADMIN) {
  return fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-admin-token': token },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: r.status === 204 ? null : await r.json() }));
}

async function demolitionRequest() {
  return requestStore.create({
    kind: 'DEMOLITION',
    requesterId: 'c-1',
    region: '양평',
    wasteCategory: 'CONSTRUCTION',
    wasteTons: 10,
    siteAddress: '양평읍 1',
    demolitionDetails: { buildingLedger: { strctCdNm: '철근콘크리트구조', totArea: 120 } },
  } as never);
}

/** 확정까지 간 견적을 저장소에 직접 넣는다(흐름 검증은 demolition-estimates.test 의 몫). */
async function finalEstimate(requestId: string, id: string, amount: number, mode?: 'REMOTE' | 'IN_PERSON') {
  await estimatePersistence.save({
    id,
    requestId,
    providerId: `p-${id}`,
    stage: 'FINAL',
    preliminary: { minAmount: 8_000_000, maxAmount: 20_000_000, createdAt: '2026-10-01' },
    visit: { scheduledAt: '2026-10-02', mode },
    final: { amount, createdAt: '2026-10-03' },
    createdAt: '2026-10-01',
  });
}

const manual = {
  requestId: 'pilot-01',
  remoteFinalAmounts: [10_000_000],
  inPersonFinalAmounts: [10_500_000, 11_500_000],
  structure: 'BRICK',
};

describe('관리자 가드', () => {
  it('토큰이 틀리면 모든 경로가 401', async () => {
    expect((await call('GET', '/api/admin/estimate-parity', undefined, 'wrong')).status).toBe(401);
    expect((await call('POST', '/api/admin/estimate-parity/samples', manual, 'wrong')).status).toBe(401);
    expect((await call('POST', '/api/admin/estimate-parity/refresh', {}, 'wrong')).status).toBe(401);
  });
});

describe('MANUAL 표본', () => {
  it('입력하면 목록·보고서에 반영된다', async () => {
    const created = await call('POST', '/api/admin/estimate-parity/samples', manual);
    expect(created.status).toBe(201);
    expect(created.body.source).toBe('MANUAL');

    const { body } = await call('GET', '/api/admin/estimate-parity');
    expect(body.samples).toHaveLength(1);
    expect(body.report.n).toBe(1);
    expect(body.report.sites[0].diffRatio).toBe(-0.0909); // 10 / 11 − 1
    expect(body.report.sites[0].inPersonSpreadRatio).toBe(0.0909); // 1 / 11
    expect(body.report.verdict).toBe('INSUFFICIENT_SAMPLE');
  });

  it('잘못된 입력은 400 + 이유', async () => {
    const res = await call('POST', '/api/admin/estimate-parity/samples', { ...manual, remoteFinalAmounts: [0] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('원격 확정 금액');
  });

  it('실적 톤 입력·삭제', async () => {
    const { body: created } = await call('POST', '/api/admin/estimate-parity/samples', manual);
    const patched = await call('PATCH', `/api/admin/estimate-parity/samples/${created.id}/actual-ton`, { actualTon: 150 });
    expect(patched.body.actualTon).toBe(150);
    expect((await call('PATCH', `/api/admin/estimate-parity/samples/${created.id}/actual-ton`, { actualTon: -1 })).status).toBe(400);
    expect((await call('DELETE', `/api/admin/estimate-parity/samples/${created.id}`)).status).toBe(204);
    expect((await call('DELETE', `/api/admin/estimate-parity/samples/${created.id}`)).status).toBe(404);
  });
});

describe('AUTO 표본 — 철거 견적에서 재계산', () => {
  it('원격·방문이 둘 다 있는 요청만 표본이 되고, 대장·추정 톤·실적 톤을 붙인다', async () => {
    const req = await demolitionRequest();
    await finalEstimate(req.id, 'a', 9_000_000, 'REMOTE');
    await finalEstimate(req.id, 'b', 10_000_000, 'IN_PERSON');
    await finalEstimate(req.id, 'c', 11_000_000); // 옛 데이터 → 방문
    const onlyInPerson = await demolitionRequest();
    await finalEstimate(onlyInPerson.id, 'd', 10_000_000);
    actualTons.set(req.id, 180);

    const { body } = await call('POST', '/api/admin/estimate-parity/refresh', {});
    expect(body.summary).toEqual({ created: 1, updated: 0, removed: 0, staled: 0 });
    expect(body.samples).toHaveLength(1);
    const s = body.samples[0];
    expect(s.id).toBe(autoSampleId(req.id));
    expect(s.remoteFinalAmounts).toEqual([9_000_000]);
    expect(s.inPersonFinalAmounts).toEqual([10_000_000, 11_000_000]);
    expect(s.structure).toBe('RC');
    expect(s.floorAreaM2).toBe(120);
    expect(s.estimatedTon).toBe(10);
    expect(s.actualTon).toBe(180);
    expect(body.report.sites[0].diffRatio).toBe(-0.1429); // 9 / 10.5 − 1
  });

  it('멱등 — 바뀐 게 없으면 다시 돌려도 갱신 0', async () => {
    const req = await demolitionRequest();
    await finalEstimate(req.id, 'a', 9_000_000, 'REMOTE');
    await finalEstimate(req.id, 'b', 10_000_000);
    await call('POST', '/api/admin/estimate-parity/refresh', {});
    const { body } = await call('POST', '/api/admin/estimate-parity/refresh', {});
    expect(body.summary).toEqual({ created: 0, updated: 0, removed: 0, staled: 0 });
  });

  it('금액이 바뀌면 갱신, 원격 견적이 사라지면 AUTO 표본을 지운다(MANUAL 은 유지)', async () => {
    const req = await demolitionRequest();
    await finalEstimate(req.id, 'a', 9_000_000, 'REMOTE');
    await finalEstimate(req.id, 'b', 10_000_000);
    await call('POST', '/api/admin/estimate-parity/samples', manual);
    await call('POST', '/api/admin/estimate-parity/refresh', {});

    await finalEstimate(req.id, 'b', 12_000_000);
    expect((await call('POST', '/api/admin/estimate-parity/refresh', {})).body.summary.updated).toBe(1);

    await estimatePersistence.delete('a');
    const { body } = await call('POST', '/api/admin/estimate-parity/refresh', {});
    expect(body.summary.removed).toBe(1);
    expect(body.samples.map((s: { source: string }) => s.source)).toEqual(['MANUAL']);
  });

  it('조회 결과가 없으면 직원이 넣은 실적 톤을 지우지 않는다', async () => {
    const req = await demolitionRequest();
    await finalEstimate(req.id, 'a', 9_000_000, 'REMOTE');
    await finalEstimate(req.id, 'b', 10_000_000);
    await call('POST', '/api/admin/estimate-parity/refresh', {});
    await call('PATCH', `/api/admin/estimate-parity/samples/${autoSampleId(req.id)}/actual-ton`, { actualTon: 95 });
    const { body } = await call('POST', '/api/admin/estimate-parity/refresh', {});
    expect(body.samples[0].actualTon).toBe(95);
  });
});

describe('AUTO 표본 — 직원 입력은 재계산으로 잃지 않는다', () => {
  async function seeded() {
    const req = await demolitionRequest();
    await finalEstimate(req.id, 'a', 9_000_000, 'REMOTE');
    await finalEstimate(req.id, 'b', 10_000_000);
    await call('POST', '/api/admin/estimate-parity/refresh', {});
    return req.id;
  }

  it('근거 견적이 사라져도 실적 톤이 있으면 지우지 않고 stale 로 남기고, 보고서에서는 뺀다', async () => {
    const requestId = await seeded();
    await call('PATCH', `/api/admin/estimate-parity/samples/${autoSampleId(requestId)}/actual-ton`, { actualTon: 95 });

    await estimatePersistence.delete('a');
    const { body } = await call('POST', '/api/admin/estimate-parity/refresh', {});
    expect(body.summary).toEqual({ created: 0, updated: 0, removed: 0, staled: 1 });
    expect(body.samples).toHaveLength(1);
    expect(body.samples[0].stale).toBe(true);
    expect(body.samples[0].staleReason).toBe(STALE_REASON_ESTIMATES_GONE);
    expect(body.samples[0].actualTon).toBe(95);
    expect(body.report.n).toBe(0);
    expect(body.report.staleCount).toBe(1);

    // 다시 돌려도 같은 표본을 또 세거나 지우지 않는다.
    const again = await call('POST', '/api/admin/estimate-parity/refresh', {});
    expect(again.body.summary).toEqual({ created: 0, updated: 0, removed: 0, staled: 0 });
    expect(again.body.samples).toHaveLength(1);
  });

  it('메모만 있어도 지우지 않는다', async () => {
    const requestId = await seeded();
    const sample = (await sampleStore.get(autoSampleId(requestId)))!;
    await sampleStore.save({ ...sample, note: '지하 정화조 있음' });

    await estimatePersistence.delete('a');
    const { body } = await call('POST', '/api/admin/estimate-parity/refresh', {});
    expect(body.summary.staled).toBe(1);
    expect(body.summary.removed).toBe(0);
    expect(body.samples[0].note).toBe('지하 정화조 있음');
  });

  it('견적이 다시 생기면 stale 이 풀리고 실적 톤·메모를 그대로 옮긴다', async () => {
    const requestId = await seeded();
    await call('PATCH', `/api/admin/estimate-parity/samples/${autoSampleId(requestId)}/actual-ton`, { actualTon: 95 });
    const sample = (await sampleStore.get(autoSampleId(requestId)))!;
    await sampleStore.save({ ...sample, note: '지하 정화조 있음' });
    await estimatePersistence.delete('a');
    await call('POST', '/api/admin/estimate-parity/refresh', {});

    await finalEstimate(requestId, 'a2', 9_500_000, 'REMOTE');
    const { body } = await call('POST', '/api/admin/estimate-parity/refresh', {});
    expect(body.summary).toEqual({ created: 0, updated: 1, removed: 0, staled: 0 });
    const rebuilt = body.samples[0];
    expect(rebuilt.stale).toBeUndefined();
    expect(rebuilt.staleReason).toBeUndefined();
    expect(rebuilt.remoteFinalAmounts).toEqual([9_500_000]);
    expect(rebuilt.actualTon).toBe(95);
    expect(rebuilt.note).toBe('지하 정화조 있음');
    expect(body.report.n).toBe(1);
    expect(body.report.staleCount).toBe(0);
  });

  it('금액만 바뀌어 다시 만들 때도 실적 톤·메모를 옮긴다', async () => {
    const requestId = await seeded();
    await call('PATCH', `/api/admin/estimate-parity/samples/${autoSampleId(requestId)}/actual-ton`, { actualTon: 120 });
    const sample = (await sampleStore.get(autoSampleId(requestId)))!;
    await sampleStore.save({ ...sample, note: '석면 확인' });

    await finalEstimate(requestId, 'b', 11_000_000);
    const { body } = await call('POST', '/api/admin/estimate-parity/refresh', {});
    expect(body.summary.updated).toBe(1);
    expect(body.samples[0].inPersonFinalAmounts).toEqual([11_000_000]);
    expect(body.samples[0].actualTon).toBe(120);
    expect(body.samples[0].note).toBe('석면 확인');
  });
});
