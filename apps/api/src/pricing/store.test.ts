import { suggestedQuoteAmount } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { PricingStore, PricingValidationError } from './store.js';

describe('PricingStore — 업체 단가', () => {
  it('단가 설정/조회, 재설정은 덮어쓴다', () => {
    const store = new PricingStore();
    expect(store.get('u1')).toBeUndefined();
    expect(store.set('u1', 80000).unitPrice).toBe(80000);
    expect(store.get('u1')?.unitPrice).toBe(80000);
    expect(store.set('u1', 90000).unitPrice).toBe(90000);
  });

  it('양의 정수가 아니면 거부', () => {
    const store = new PricingStore();
    expect(() => store.set('u1', 0)).toThrow(PricingValidationError);
    expect(() => store.set('u1', -100)).toThrow(PricingValidationError);
    expect(() => store.set('u1', 1.5)).toThrow(PricingValidationError);
  });
});

describe('suggestedQuoteAmount — 견적 예상 금액', () => {
  it('운반·처리는 단가 × 톤', () => {
    expect(suggestedQuoteAmount('TRANSPORT_COMPANY', 20000, 3)).toBe(60000);
    expect(suggestedQuoteAmount('WASTE_TREATMENT_PLANT', 15000, 2.5)).toBe(37500);
  });

  it('철거는 단위(원/㎡)라 톤과 무관하게 단가를 반환', () => {
    expect(suggestedQuoteAmount('DEMOLITION_COMPANY', 50000, 7)).toBe(50000);
  });
});
