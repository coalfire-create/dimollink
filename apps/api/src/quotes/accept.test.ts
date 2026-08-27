import { PILOT } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { RequestStore } from '../requests/store.js';
import { QuoteStore, QuoteValidationError } from './store.js';

async function setup() {
  const requestStore = new RequestStore();
  const quoteStore = new QuoteStore(requestStore);
  const request = await requestStore.create({
    kind: 'DEMOLITION',
    requesterId: 'consumer-1',
    region: PILOT.region,
    wasteCategory: PILOT.wasteCategory,
    wasteTons: 3,
    allbaroRequested: false,
    siteAddress: '양평읍 현장',
  });
  return { requestStore, quoteStore, request };
}

describe('QuoteStore.accept / acceptedFees', () => {
  it('요청자가 견적을 수락하면 accepted=true, acceptedFees 에 반영', async () => {
    const { quoteStore, request } = await setup();
    const q = await quoteStore.createQuote({
      requestId: request.id,
      providerId: 'transport-1',
      party: 'TRANSPORT',
      amount: 120000,
    });
    expect((await quoteStore.accept(q.id, 'consumer-1')).accepted).toBe(true);
    expect(await quoteStore.acceptedFees(request.id)).toEqual({ transportFee: 120000, disposalFee: 0 });
  });

  it('요청자가 아니면 수락 불가', async () => {
    const { quoteStore, request } = await setup();
    const q = await quoteStore.createQuote({
      requestId: request.id,
      providerId: 'transport-1',
      party: 'TRANSPORT',
      amount: 100000,
    });
    await expect(quoteStore.accept(q.id, 'someone-else')).rejects.toThrow(QuoteValidationError);
  });

  it('같은 party 재수락 시 이전 수락은 해제(파티당 1건)', async () => {
    const { quoteStore, request } = await setup();
    const q1 = await quoteStore.createQuote({ requestId: request.id, providerId: 't1', party: 'TRANSPORT', amount: 100000 });
    const q2 = await quoteStore.createQuote({ requestId: request.id, providerId: 't2', party: 'TRANSPORT', amount: 90000 });
    await quoteStore.accept(q1.id, 'consumer-1');
    await quoteStore.accept(q2.id, 'consumer-1');
    expect((await quoteStore.acceptedFees(request.id)).transportFee).toBe(90000);
    expect(
      (await quoteStore.listQuotes({ requestId: request.id })).find((q) => q.id === q1.id)?.accepted,
    ).toBe(false);
  });

  it('견적 수락 시 요청이 그 업체로 매칭 확정(MATCHED)된다', async () => {
    const { quoteStore, requestStore, request } = await setup();
    const q = await quoteStore.createQuote({
      requestId: request.id,
      providerId: 'plant-1',
      party: 'DISPOSAL',
      amount: 90000,
    });
    await quoteStore.accept(q.id, 'consumer-1');
    const updated = await requestStore.get(request.id);
    expect(updated?.status).toBe('MATCHED');
    expect(updated?.matchedProviderId).toBe('plant-1');
  });

  it('운반+처리 각각 수락 시 합산된 정산 금액', async () => {
    const { quoteStore, request } = await setup();
    const t = await quoteStore.createQuote({ requestId: request.id, providerId: 't', party: 'TRANSPORT', amount: 120000 });
    const d = await quoteStore.createQuote({ requestId: request.id, providerId: 'd', party: 'DISPOSAL', amount: 80000 });
    await quoteStore.accept(t.id, 'consumer-1');
    await quoteStore.accept(d.id, 'consumer-1');
    expect(await quoteStore.acceptedFees(request.id)).toEqual({ transportFee: 120000, disposalFee: 80000 });
  });
});
