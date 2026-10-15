import { describe, expect, it } from 'vitest';
import { canUseStore } from '@dimol/shared';

describe('canUseStore', () => {
  it('철거업체 멤버십만 있는 지금은 철거업체에게만 스토어가 보인다', () => {
    expect(canUseStore('DEMOLITION_COMPANY')).toBe(true);
    for (const type of [
      'CONSUMER',
      'TRANSPORT_COMPANY',
      'WASTE_TREATMENT_PLANT',
      'INTERIOR_COMPANY',
    ] as const) {
      expect(canUseStore(type)).toBe(false);
    }
  });
});
