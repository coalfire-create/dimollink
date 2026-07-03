import { PILOT } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { RequestStore } from '../requests/store.js';
import { QuoteStore, QuoteValidationError } from './store.js';

function setup() {
  const requestStore = new RequestStore();
  const quoteStore = new QuoteStore(requestStore);
  const request = requestStore.create({
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
  it('요청자가 견적을 수락하면 accepted=true, acceptedFees 에 반영', () => {
    const { quoteStore, request } = setup();
    const q = quoteStore.createQuote({
      requestId: request.id,
      providerId: 'transport-1',
      party: 'TRANSPORT',
      amount: 120000,
    });
    expect(quoteStore.accept(q.id, 'consumer-1').accepted).toBe(true);
    expect(quoteStore.acceptedFees(request.id)).toEqual({ transportFee: 120000, disposalFee: 0 });
  });

  it('요청자가 아니면 수락 불가', () => {
    const { quoteStore, request } = setup();
    const q = quoteStore.createQuote({
      requestId: request.id,
      providerId: 'transport-1',
      party: 'TRANSPORT',
      amount: 100000,
    });
    expect(() => quoteStore.accept(q.id, 'someone-else')).toThrow(QuoteValidationError);
  });

  it('같은 party 재수락 시 이전 수락은 해제(파티당 1건)', () => {
    const { quoteStore, request } = setup();
    const q1 = quoteStore.createQuote({ requestId: request.id, providerId: 't1', party: 'TRANSPORT', amount: 100000 });
    const q2 = quoteStore.createQuote({ requestId: request.id, providerId: 't2', party: 'TRANSPORT', amount: 90000 });
    quoteStore.accept(q1.id, 'consumer-1');
    quoteStore.accept(q2.id, 'consumer-1');
    expect(quoteStore.acceptedFees(request.id).transportFee).toBe(90000);
    expect(quoteStore.listQuotes({ requestId: request.id }).find((q) => q.id === q1.id)?.accepted).toBe(false);
  });

  it('운반+처리 각각 수락 시 합산된 정산 금액', () => {
    const { quoteStore, request } = setup();
    const t = quoteStore.createQuote({ requestId: request.id, providerId: 't', party: 'TRANSPORT', amount: 120000 });
    const d = quoteStore.createQuote({ requestId: request.id, providerId: 'd', party: 'DISPOSAL', amount: 80000 });
    quoteStore.accept(t.id, 'consumer-1');
    quoteStore.accept(d.id, 'consumer-1');
    expect(quoteStore.acceptedFees(request.id)).toEqual({ transportFee: 120000, disposalFee: 80000 });
  });
});
