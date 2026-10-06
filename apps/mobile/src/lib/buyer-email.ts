import { useState } from 'react';
import type { UserProfile } from '@dimol/shared';
import { updateEmail } from '../api/client';
import { knownEmail, portOneCustomer, type PortOneCustomer } from './portone-customer';

/**
 * 결제 직전 구매자 이메일 확보.
 *
 * KG이니시스 PC 결제창은 구매자 이메일이 없으면 열리지 않는다. 가입은 휴대폰만으로 하므로
 * 대부분 회원에게 이메일이 없어서, **처음 결제할 때 한 번** 묻고 프로필에 저장한다.
 * 가입 화면에 칸을 늘리지 않은 이유: 결제하지 않는 회원(운반업체·처리장 대부분)까지
 * 입력을 강요하게 된다.
 *
 * 사용법: 결제창을 여는 함수를 `withCustomer(run)` 으로 감싸고, 화면에 `prompt` 를
 * [[BuyerEmailModal]] 로 그린다. 이메일을 이미 알면 `run` 이 바로 불린다.
 */
export function useBuyerEmail(user: UserProfile) {
  const [email, setEmail] = useState(() => knownEmail(user));
  const [pending, setPending] = useState<((customer: PortOneCustomer) => void) | null>(null);

  function withCustomer(run: (customer: PortOneCustomer) => void) {
    if (email) run(portOneCustomer(user, email));
    else setPending(() => run);
  }

  /** 입력값은 모달이 형식 검사를 마친 뒤 넘긴다. */
  async function submit(value: string) {
    const run = pending;
    setPending(null);
    // 저장이 실패해도 이번 결제는 이 주소로 진행한다 — 다음 결제 때 다시 물을 뿐이다.
    await updateEmail(user.id, value).catch(() => undefined);
    setEmail(value);
    run?.(portOneCustomer(user, value));
  }

  return {
    withCustomer,
    prompt: {
      visible: pending !== null,
      onSubmit: submit,
      onClose: () => setPending(null),
    },
  };
}
