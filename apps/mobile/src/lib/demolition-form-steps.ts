import type { RequestFormErrors, RequestFormField } from './request-form-validation';

/**
 * 철거 신청을 한 화면에 한 질문씩 나눈 단계.
 *
 * 한 페이지에 주소·건물·면적·층수·진입 조건·달력·사진·올바로까지 다 깔려 있으면
 * 고령 사용자는 어디까지 했는지, 얼마나 남았는지를 스크롤로 가늠해야 한다.
 * 단계마다 질문 하나를 크게 묻고, 그 단계의 칸만 검사해서 넘어간다.
 *
 * 검사 규칙 자체는 [[request-form-validation]] 한 곳에 있다 — 여기서는 어느 칸이
 * 어느 단계에 속하는지만 정한다(규칙을 단계별로 복사하면 둘이 어긋난다).
 */
export type DemolitionStepKey = 'site' | 'building' | 'schedule' | 'photos';

export interface DemolitionStep {
  key: DemolitionStepKey;
  /** 진행 표시줄에 쓰는 짧은 이름. */
  label: string;
  /** 화면 맨 위에 크게 묻는 질문. */
  question: string;
  /** 이 단계에서 검사하는 칸. */
  fields: RequestFormField[];
}

export const DEMOLITION_STEPS: readonly DemolitionStep[] = [
  {
    key: 'site',
    label: '현장 위치',
    question: '철거할 현장은 어디인가요?',
    // 지역은 주소에서 자동으로 따라온다 — 주소 단계에서 같이 막는다.
    fields: ['region', 'siteAddress'],
  },
  {
    key: 'building',
    label: '건물 정보',
    question: '어떤 공간을 철거하나요?',
    fields: ['spaceSize', 'floorCount'],
  },
  {
    key: 'schedule',
    label: '조건 · 일정',
    question: '현장 여건과 희망 일정을 알려 주세요',
    fields: [],
  },
  {
    key: 'photos',
    label: '사진 · 확인',
    question: '현장 사진을 올리면 견적이 정확해져요',
    fields: [],
  },
];

/** 전체 검사 결과 중 이 단계 칸의 오류만. */
export function stepErrors(errors: RequestFormErrors, step: DemolitionStep): RequestFormErrors {
  const picked: RequestFormErrors = {};
  for (const field of step.fields) {
    if (errors[field]) picked[field] = errors[field];
  }
  return picked;
}

/** 오류가 있는 첫 단계의 번호 — 없으면 -1. 마지막에 접수할 때 그 단계로 되돌린다. */
export function firstStepWithErrors(errors: RequestFormErrors): number {
  return DEMOLITION_STEPS.findIndex((step) => step.fields.some((field) => errors[field]));
}
