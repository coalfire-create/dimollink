import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { suggestedQuoteAmount, type ProviderPricing, type RankedJob } from '@dimol/shared';
import { getPricing, submitQuote } from '../../api/client';
import { AppButton, ErrorBanner, Field, InlineEmpty, SectionTitle } from '../../components/ui';
import { useSession } from '../../navigation';
import { theme } from '../../theme';
import { OpenJobCard } from './JobCard';
import { amountReadout } from '../../lib/format';

/**
 * 새 반입 예약 — 처리장이 건별로 견적을 제출한다.
 *
 * 운반 콜(OpenCallList)과 달리 **제출해도 바로 확정되지 않는다.** 처리장은 값을 내고
 * 배출자의 선택을 기다린다. 그래서 수락 버튼 대신 "제출됨 · 선택 대기" 표시로 바뀐다 —
 * 제출한 건에 버튼이 그대로 남아 있으면 두 번 내게 된다.
 */
export function IntakeQuoteList({ jobs }: { jobs: RankedJob[] }) {
  const user = useSession();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pricing, setPricing] = useState<ProviderPricing | null>(null);

  useEffect(() => {
    getPricing(user.id)
      .then(setPricing)
      .catch(() => setPricing(null));
  }, [user.id]);

  // 저장된 단가가 있으면 아직 안 적은 칸만 예상 금액으로 채운다.
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

  async function submit(requestId: string) {
    setError(null);
    const amount = Number((amounts[requestId] ?? '').replace(/\D/g, ''));
    if (!Number.isInteger(amount) || amount <= 0) {
      setError('견적 금액(원)을 정확히 입력해 주세요.');
      return;
    }
    setBusyId(requestId);
    try {
      await submitQuote({ requestId, party: 'DISPOSAL', amount });
      setSubmittedIds((prev) => [...prev, requestId]);
    } catch {
      setError('견적 제출에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <SectionTitle>새 반입 예약</SectionTitle>
      <ErrorBanner message={error} />
      {jobs.length > 0 ? (
        jobs.map((job) => (
          <OpenJobCard key={job.id} job={job}>
            {submittedIds.includes(job.id) ? (
              <Text style={styles.done}>✓ 견적 제출됨 · 요청자 선택 대기</Text>
            ) : (
              <>
                <Field
                  label="견적 금액(원)"
                  value={amounts[job.id] ?? ''}
                  // 숫자만 치면 0 하나 차이를 놓친다 — 아래에 말로 읽어 준다.
                  hint={amountReadout(amounts[job.id] ?? '')}
                  onChangeText={(value) => setAmounts((prev) => ({ ...prev, [job.id]: value }))}
                  placeholder="예) 80000"
                  keyboardType="number-pad"
                />
                <AppButton
                  label="견적 제출"
                  onPress={() => void submit(job.id)}
                  loading={busyId === job.id}
                />
              </>
            )}
          </OpenJobCard>
        ))
      ) : (
        <InlineEmpty>아직 들어온 반입 예약이 없어요.</InlineEmpty>
      )}
    </>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  done: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
    paddingVertical: spacing.xs,
  },
});
