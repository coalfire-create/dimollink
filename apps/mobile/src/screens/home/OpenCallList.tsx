import React, { useEffect, useState } from 'react';
import { suggestedQuoteAmount, type ProviderPricing, type RankedJob } from '@dimol/shared';
import { acceptJob, getPricing } from '../../api/client';
import { AppButton, ErrorBanner, Field, InlineEmpty, SectionTitle } from '../../components/ui';
import { useNavigation, useSession } from '../../navigation';
import { OpenJobCard } from './JobCard';
import { amountReadout } from '../../lib/format';

/**
 * 들어온 운반 콜 — 금액을 적고 수락하면 그 자리에서 매칭된다.
 *
 * 마이페이지에 저장해 둔 단가가 있으면 금액 칸을 미리 채운다(단가 × 톤). 운반은
 * 콜이 들어오고 몇 분 안에 잡히는 일이라, 매번 계산기를 두드리게 하면 놓친다.
 * 물론 채워진 값은 그대로 고칠 수 있다 — 현장 조건은 건마다 다르다.
 */
export function OpenCallList({ jobs, onAccepted }: { jobs: RankedJob[]; onAccepted: () => void }) {
  const nav = useNavigation();
  const user = useSession();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pricing, setPricing] = useState<ProviderPricing | null>(null);

  useEffect(() => {
    getPricing(user.id)
      .then(setPricing)
      .catch(() => setPricing(null));
  }, [user.id]);

  // 저장된 단가가 있으면 아직 안 적은 칸만 예상 금액으로 채운다(적은 값은 건드리지 않는다).
  useEffect(() => {
    if (!pricing) return;
    setAmounts((prev) => {
      const next = { ...prev };
      for (const job of jobs) {
        if (!next[job.id]) {
          next[job.id] = String(
            suggestedQuoteAmount(user.userType, pricing.unitPrice, job.wasteTons),
          );
        }
      }
      return next;
    });
  }, [pricing, jobs, user.userType]);

  async function accept(requestId: string) {
    setError(null);
    const amount = Number((amounts[requestId] ?? '').replace(/\D/g, ''));
    if (!Number.isInteger(amount) || amount <= 0) {
      setError('수락 금액(원)을 정확히 입력해 주세요.');
      return;
    }
    setAcceptingId(requestId);
    try {
      await acceptJob(requestId, amount);
    } catch {
      // 실패해도 목록을 새로 불러온다 — 다른 업체가 먼저 가져갔을 수 있다.
    } finally {
      setAcceptingId(null);
      onAccepted();
    }
  }

  return (
    <>
      <SectionTitle>들어온 운반 콜</SectionTitle>
      <ErrorBanner message={error} />
      {jobs.length > 0 ? (
        jobs.map((job) => (
          <OpenJobCard key={job.id} job={job}>
            <Field
              label="수락 금액(원)"
              value={amounts[job.id] ?? ''}
              // 숫자만 치면 0 하나 차이를 놓친다 — 아래에 말로 읽어 준다.
              hint={amountReadout(amounts[job.id] ?? '')}
              onChangeText={(value) => setAmounts((prev) => ({ ...prev, [job.id]: value }))}
              placeholder="예) 80000"
              keyboardType="number-pad"
            />
            <AppButton
              label="콜 수락하기"
              onPress={() => void accept(job.id)}
              loading={acceptingId === job.id}
            />
          </OpenJobCard>
        ))
      ) : (
        <InlineEmpty
          actionLabel="내 활동 지역 및 콜대기 설정"
          onAction={() => nav.switchTab('mypage')}
        >
          아직 들어온 콜이 없어요. 콜대기를 켜두면 요청이 들어와요.
        </InlineEmpty>
      )}
    </>
  );
}
