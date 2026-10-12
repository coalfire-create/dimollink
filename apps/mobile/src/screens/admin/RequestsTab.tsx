import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  type MatchStatus,
  type ServiceRequest,
} from '@dimol/shared';
import { adminExecutePayout, adminForceStatus, adminListRequests } from '../../api/client';
import { alertDialog } from '../../lib/dialog';
import { AppButton, Card, Field, SectionTitle } from '../../components/ui';
import { Empty, Hint, adminStyles as s, confirmThen, errorMessage, useAdminList } from './shared';
import type { AdminTabProps } from './shared';

/**
 * 정산 실행 + 멈춘 요청 개입.
 *
 * 개입은 정상 전이 규칙을 건너뛰므로 사유가 필수다. 그리고 **상태만 바뀌고 돈은
 * 따라 움직이지 않는다** — 결제된 건은 그 사실을 미리·사후에 모두 알린다.
 */

/** 개입으로 보낼 수 있는 상태. 정산완료는 되돌릴 수 없어 목록에 없다. */
const FORCE_TARGETS: readonly MatchStatus[] = [
  'MATCHED',
  'PAID',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

function todayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function RequestsTab({ token, onError }: AdminTabProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  /** 개입 사유 — 요청별로 따로 들고 있어야 여러 건을 헷갈리지 않는다. */
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const loadSettle = useCallback(() => adminListRequests(token, 'COMPLETED'), [token]);
  const loadAll = useCallback(() => adminListRequests(token), [token]);
  const settleQueue = useAdminList<ServiceRequest>(loadSettle, onError, '정산 대기 조회에 실패했습니다.');
  const requests = useAdminList<ServiceRequest>(loadAll, onError, '요청 목록 조회에 실패했습니다.');

  async function run<T>(id: string, fn: () => Promise<T>, fallback: string): Promise<T | undefined> {
    setBusyId(id);
    try {
      return await fn();
    } catch (err) {
      onError(errorMessage(err, fallback));
      return undefined;
    } finally {
      setBusyId(null);
    }
  }

  async function settle(requestId: string) {
    const ok = await run(
      requestId,
      () => adminExecutePayout(token, requestId, todayKST()),
      '정산 실행에 실패했습니다.',
    );
    if (ok) settleQueue.setItems((prev) => prev.filter((r) => r.id !== requestId));
  }

  async function force(request: ServiceRequest, to: MatchStatus) {
    const reason = (reasons[request.id] ?? '').trim();
    if (!reason) {
      onError('개입 사유를 먼저 입력해 주세요. 사유 없이는 바꿀 수 없습니다.');
      return;
    }
    const updated = await run(
      request.id,
      () => adminForceStatus(token, request.id, to, reason),
      '상태 변경에 실패했습니다.',
    );
    if (!updated) return;
    requests.setItems((prev) => prev.map((r) => (r.id === request.id ? updated : r)));
    setReasons((prev) => ({ ...prev, [request.id]: '' }));
    if (updated.refundRequired) {
      alertDialog(
        '환불이 남았습니다',
        '요청은 취소했지만 결제 금액은 아직 그대로입니다. 결제 내역에서 환불을 따로 실행해 주세요.',
      );
    }
  }

  return (
    <>
      <SectionTitle>정산 대기 ({settleQueue.items.length})</SectionTitle>
      {settleQueue.items.length === 0 ? (
        <Empty>정산할 완료 건이 없어요.</Empty>
      ) : (
        settleQueue.items.map((r) => (
          <Card key={r.id}>
            <Text style={s.name}>{REQUEST_KIND_LABELS[r.kind]}</Text>
            <Text style={s.meta}>
              {r.agreedFee !== undefined ? `${r.agreedFee.toLocaleString('ko-KR')}원` : '금액 미확정'}
              {` · ${r.wasteTons}톤 · ${r.region}`}
            </Text>
            <AppButton
              label="정산 실행"
              onPress={() => confirmThen('정산 실행', '지급대행을 실행합니다.', () => void settle(r.id))}
              loading={busyId === r.id}
            />
          </Card>
        ))
      )}

      <SectionTitle>요청 개입 ({requests.items.length})</SectionTitle>
      <Hint>
        업체가 잠수하거나 연락이 끊겨 멈춘 요청을 정리합니다. 정상 규칙을 건너뛰므로 사유가
        반드시 남습니다. 정산완료 건은 되돌릴 수 없습니다.
      </Hint>
      {requests.items.slice(0, 30).map((r) => (
        <Card key={r.id}>
          <Text style={s.name}>
            {REQUEST_KIND_LABELS[r.kind]} · {REQUEST_STATUS_LABELS[r.status]}
          </Text>
          <Text style={s.meta}>
            {r.region} · {r.wasteTons}톤{r.matchedProviderId ? ' · 매칭됨' : ' · 미매칭'}
          </Text>
          {r.status === 'SETTLED' ? (
            <Text style={s.meta}>정산이 끝난 건이라 변경할 수 없습니다.</Text>
          ) : (
            <>
              {r.paymentId ? (
                <Text style={s.warn}>결제된 건입니다. 취소해도 환불은 자동으로 되지 않습니다.</Text>
              ) : null}
              <View style={s.spacer} />
              <Field
                label="개입 사유 (필수)"
                value={reasons[r.id] ?? ''}
                onChangeText={(v) => setReasons((prev) => ({ ...prev, [r.id]: v }))}
                placeholder="예) 업체 연락두절 3일, 배출자 요청으로 취소"
              />
              <View style={s.chipRow}>
                {FORCE_TARGETS.filter((next) => next !== r.status).map((next) => (
                  <Pressable
                    key={next}
                    accessibilityRole="button"
                    accessibilityLabel={`상태를 ${next}(으)로 강제 변경`}
                    style={s.chip}
                    onPress={() =>
                      confirmThen(
                        '상태 강제 변경',
                        `${REQUEST_STATUS_LABELS[r.status]} → ${REQUEST_STATUS_LABELS[next]} 로 바꿉니다.`,
                        () => void force(r, next),
                      )
                    }
                  >
                    <Text style={s.chipLabel}>{REQUEST_STATUS_LABELS[next]}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </Card>
      ))}
    </>
  );
}
