import { describe, expect, it } from 'vitest';
import { DEMOLITION_STEPS, firstStepWithErrors, stepErrors } from './demolition-form-steps';
import { validateRequestForm, type RequestFormValues } from './request-form-validation';

const empty: RequestFormValues = {
  kind: 'DEMOLITION',
  region: '',
  siteAddress: '',
  spaceSize: '',
  floorCount: '',
  wasteItems: [],
  loadAddress: '',
  unloadAddress: '',
  visitAt: '',
};

describe('demolition form steps', () => {
  it('철거 폼이 검사하는 칸은 빠짐없이 어느 한 단계에 속한다', () => {
    const errors = validateRequestForm({ ...empty, spaceSize: '삼십', floorCount: '없음' });
    const covered = new Set(DEMOLITION_STEPS.flatMap((s) => s.fields));
    for (const field of Object.keys(errors)) expect(covered.has(field as never)).toBe(true);
  });

  it('주소 단계는 주소·지역 오류만 본다', () => {
    const errors = validateRequestForm({ ...empty, spaceSize: '삼십' });
    expect(Object.keys(stepErrors(errors, DEMOLITION_STEPS[0]!)).sort()).toEqual([
      'region',
      'siteAddress',
    ]);
  });

  it('접수 시 오류가 있는 첫 단계로 되돌린다', () => {
    const filled = { ...empty, region: '경기 양평군', siteAddress: '양평읍 1' };
    expect(firstStepWithErrors(validateRequestForm({ ...filled, spaceSize: '삼십' }))).toBe(1);
    expect(firstStepWithErrors(validateRequestForm(empty))).toBe(0);
    expect(firstStepWithErrors(validateRequestForm(filled))).toBe(-1);
  });
});
