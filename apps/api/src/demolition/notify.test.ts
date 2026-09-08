import { describe, expect, it } from 'vitest';
import { DemolitionEstimateStore } from './store.js';
import { RequestStore } from '../requests/store.js';

/**
 * 견적 알림 — 이 흐름은 상대가 다음 행동을 해야 이어진다.
 * 개산이 와도 소비자가 모르면 실사를 못 부르고, 실사가 잡혀도 업체가 모르면 안 간다.
 * 그래서 각 단계에서 **누구에게** 가는지를 못 박는다.
 */

async function setup() {
  const sent: Array<{ userId: string; message: string }> = [];
  const requestStore = new RequestStore();
  const store = new DemolitionEstimateStore(requestStore, undefined, (_r, userId, message) => {
    sent.push({ userId, message });
  });
  const request = await requestStore.create({
    kind: 'DEMOLITION',
    requesterId: 'consumer',
    region: '양평',
    wasteCategory: 'CONSTRUCTION',
    wasteTons: 10,
    siteAddress: '양평읍 1',
  } as never);
  return { sent, store, requestStore, request };
}

const PRELIM = { minAmount: 8_000_000, maxAmount: 12_000_000 };

describe('철거 견적 알림', () => {
  it('개산이 도착하면 소비자에게 간다', async () => {
    const { sent, store, request } = await setup();
    await store.createPreliminary({
      requestId: request.id,
      providerId: 'p1',
      providerName: '대한철거',
      ...PRELIM,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].userId).toBe('consumer');
    expect(sent[0].message).toContain('개산 견적이 도착');
  });

  it('실사가 예약되면 업체에게 간다', async () => {
    const { sent, store, request } = await setup();
    const e = await store.createPreliminary({ requestId: request.id, providerId: 'p1', ...PRELIM });
    sent.length = 0;
    await store.scheduleVisit(e.id, 'consumer', '2026-09-20T05:00:00.000Z');
    expect(sent).toHaveLength(1);
    expect(sent[0].userId).toBe('p1');
    expect(sent[0].message).toContain('실사가 예약');
  });

  it('확정 견적이 오면 소비자에게 간다', async () => {
    const { sent, store, request } = await setup();
    const e = await store.createPreliminary({ requestId: request.id, providerId: 'p1', ...PRELIM });
    await store.scheduleVisit(e.id, 'consumer', '2026-09-20T05:00:00.000Z');
    sent.length = 0;
    await store.submitFinal(e.id, 'p1', 11_000_000, undefined, undefined);
    expect(sent).toHaveLength(1);
    expect(sent[0].userId).toBe('consumer');
    expect(sent[0].message).toContain('확정 견적이 도착');
  });

  it('수락하면 선정 업체와 탈락 업체 모두에게 간다 — 안 알리면 계속 기다린다', async () => {
    const { sent, store, request } = await setup();
    const win = await store.createPreliminary({ requestId: request.id, providerId: 'p1', ...PRELIM });
    const lose = await store.createPreliminary({ requestId: request.id, providerId: 'p2', ...PRELIM });
    await store.scheduleVisit(win.id, 'consumer', '2026-09-20T05:00:00.000Z');
    await store.submitFinal(win.id, 'p1', 11_000_000, undefined, undefined);
    sent.length = 0;

    await store.accept(win.id, 'consumer');
    const targets = sent.map((s) => s.userId);
    expect(targets).toContain('p1');
    expect(targets).toContain('p2');
    expect(sent.find((s) => s.userId === 'p2')?.message).toContain('다른 업체가 선정');
    void lose;
  });

  it('알림이 실패해도 견적 흐름은 계속된다', async () => {
    const requestStore = new RequestStore();
    const store = new DemolitionEstimateStore(requestStore, undefined, () => {
      throw new Error('알림 장애');
    });
    const request = await requestStore.create({
      kind: 'DEMOLITION',
      requesterId: 'consumer',
      region: '양평',
      wasteCategory: 'CONSTRUCTION',
      wasteTons: 10,
      siteAddress: '양평읍 1',
    } as never);
    await expect(
      store.createPreliminary({ requestId: request.id, providerId: 'p1', ...PRELIM }),
    ).resolves.toBeDefined();
  });
});
