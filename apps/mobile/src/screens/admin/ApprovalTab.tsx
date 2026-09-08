import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { USER_TYPE_LABELS, formatBusinessNumber, type UserProfile } from '@dimol/shared';
import { adminListUsers, adminSetApproval, adminSetRole } from '../../api/client';
import { AppButton, Card, SectionTitle } from '../../components/ui';
import { FadeInUp } from '../../components/motion';
import { theme } from '../../theme';
import { Empty, Hint, adminStyles as s, confirmThen, errorMessage, useAdminList } from './shared';
import { Text } from 'react-native';
import type { AdminTabProps } from './shared';

/** 업체 승인 대기 처리 + 계정 권한 부여/회수. */
export function ApprovalTab({ token, onError }: AdminTabProps) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadPending = useCallback(() => adminListUsers(token, 'PENDING'), [token]);
  const loadAll = useCallback(() => adminListUsers(token), [token]);
  const pending = useAdminList<UserProfile>(loadPending, onError, '승인 대기 조회에 실패했습니다.');
  const all = useAdminList<UserProfile>(loadAll, onError, '회원 목록 조회에 실패했습니다.');

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

  async function decide(userId: string, status: 'APPROVED' | 'SUSPENDED') {
    const ok = await run(userId, () => adminSetApproval(token, userId, status), '처리에 실패했습니다.');
    if (ok) pending.setItems((prev) => prev.filter((u) => u.id !== userId));
  }

  async function setRole(user: UserProfile, role: 'ADMIN' | 'MEMBER') {
    const updated = await run(user.id, () => adminSetRole(token, user.id, role), '권한 변경에 실패했습니다.');
    if (updated) all.setItems((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
  }

  return (
    <>
      <SectionTitle>승인 대기 ({pending.items.length})</SectionTitle>
      {pending.items.length === 0 ? (
        <Empty>승인 대기 중인 업체가 없어요.</Empty>
      ) : (
        pending.items.map((u, i) => (
          <FadeInUp key={u.id} delay={Math.min(i, 6) * 60}>
            <Card>
              <Text style={s.name}>{u.name}</Text>
              <Text style={s.meta}>
                {USER_TYPE_LABELS[u.userType] ?? u.userType}
                {u.businessNumber ? ` · 사업자 ${formatBusinessNumber(u.businessNumber)}` : ''}
              </Text>
              <Text style={s.meta}>{u.allbaroCertified ? '✓ 올바로 인증' : '올바로 미인증'}</Text>
              <View style={s.actions}>
                <AppButton
                  label="승인"
                  onPress={() => decide(u.id, 'APPROVED')}
                  loading={busyId === u.id}
                  style={s.actionBtn}
                />
                <View style={{ width: theme.spacing.sm }} />
                <AppButton
                  label="거절"
                  variant="danger"
                  onPress={() => decide(u.id, 'SUSPENDED')}
                  loading={busyId === u.id}
                  style={s.actionBtn}
                />
              </View>
            </Card>
          </FadeInUp>
        ))
      )}

      <SectionTitle>계정 권한</SectionTitle>
      <Hint>
        관리자로 지정하면 로그인만으로 이 화면에 들어옵니다. 누가 무엇을 했는지 서버에
        남으므로, 공유 토큰 대신 계정을 쓰는 편이 안전합니다.
      </Hint>
      {all.items.slice(0, 40).map((u) => (
        <Card key={u.id}>
          <Text style={s.name}>
            {u.name}
            {u.role === 'ADMIN' ? '  · 관리자' : ''}
          </Text>
          <Text style={s.meta}>
            {USER_TYPE_LABELS[u.userType] ?? u.userType} · {u.approvalStatus}
          </Text>
          <View style={s.actions}>
            {u.role === 'ADMIN' ? (
              <AppButton
                label="관리자 해제"
                variant="danger"
                loading={busyId === u.id}
                style={s.actionBtn}
                onPress={() =>
                  confirmThen('관리자 해제', `${u.name} 님의 관리자 권한을 뺍니다.`, () =>
                    void setRole(u, 'MEMBER'),
                  )
                }
              />
            ) : (
              <AppButton
                label="관리자 지정"
                variant="outline"
                loading={busyId === u.id}
                style={s.actionBtn}
                onPress={() =>
                  confirmThen('관리자 지정', `${u.name} 님이 백오피스 전체를 쓸 수 있게 됩니다.`, () =>
                    void setRole(u, 'ADMIN'),
                  )
                }
              />
            )}
          </View>
        </Card>
      ))}
    </>
  );
}
