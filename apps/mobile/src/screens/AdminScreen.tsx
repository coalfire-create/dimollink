import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  USER_TYPE_LABELS,
  formatBusinessNumber,
  type MatchStatus,
  type ProviderPricing,
  type ServiceRequest,
  type UserProfile,
} from '@dimol/shared';
import {
  ApiError,
  adminAllbaroFailures,
  adminAllbaroQueue,
  adminAllbaroRetryNow,
  adminAllbaroRetryOne,
  adminExecutePayout,
  adminForceStatus,
  adminListAnomalies,
  adminListIncidents,
  adminListPricing,
  adminListRequests,
  adminListUsers,
  adminQuotesSummary,
  adminResolveIncident,
  adminSetApproval,
  adminSetRole,
  adminWasteMaterials,
  type AdminAnomaly,
  type AdminIncident,
  type AdminQuoteSummaryRow,
  type AdminRetryItem,
  type AdminWasteMaterialRow,
} from '../api/client';
import { AppButton, Card, ErrorBanner, Field, SectionTitle } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { theme } from '../theme';

/**
 * 관리자 백오피스.
 *
 * 인증은 두 갈래다:
 *  - **관리자 계정 로그인**(권장): role=ADMIN 회원이면 토큰 칸을 비워두면 된다.
 *    세션으로 들어가야 서버 감사 로그에 "누가" 했는지가 남는다.
 *  - **공유 운영 토큰**: 첫 관리자를 만들 때와 계정이 잠겼을 때의 비상 경로.
 *
 * 화면을 탭으로 나눈 이유: 승인 대기만 보러 들어왔는데 올바로 큐·이상거래까지
 * 한 화면에 쏟아지면 무엇을 해야 하는지 안 보인다. 탭마다 "지금 할 일"이 하나씩이다.
 */

type TabKey = 'approval' | 'requests' | 'incidents' | 'allbaro' | 'stats';

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'approval', label: '승인·권한' },
  { key: 'requests', label: '요청 제어' },
  { key: 'incidents', label: '분쟁·이상' },
  { key: 'allbaro', label: '올바로' },
  { key: 'stats', label: '현황' },
];

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

function message(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function AdminScreen({ onBack }: { onBack: () => void }) {
  const [token, setToken] = useState('');
  const [tab, setTab] = useState<TabKey>('approval');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [pending, setPending] = useState<UserProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [settleQueue, setSettleQueue] = useState<ServiceRequest[]>([]);
  const [incidents, setIncidents] = useState<AdminIncident[]>([]);
  const [anomalies, setAnomalies] = useState<AdminAnomaly[]>([]);
  const [queue, setQueue] = useState<AdminRetryItem[]>([]);
  const [failures, setFailures] = useState<AdminRetryItem[]>([]);
  const [wasteMaterials, setWasteMaterials] = useState<AdminWasteMaterialRow[]>([]);
  const [quotesSummary, setQuotesSummary] = useState<AdminQuoteSummaryRow[]>([]);
  const [pricingRows, setPricingRows] = useState<ProviderPricing[]>([]);

  /** 개입 사유 입력값 — 요청별로 따로 들고 있어야 여러 건을 헷갈리지 않는다. */
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    const t = token.trim();
    try {
      // 첫 조회는 실패를 그대로 보여준다 — 인증이 틀렸는지 여기서 알아야 한다.
      setPending(await adminListUsers(t, 'PENDING'));
      setReady(true);
      // 나머지는 개별 실패를 삼킨다. 한 곳이 죽어도 화면은 떠야 한다.
      const settle = () => adminListRequests(t, 'COMPLETED').catch(() => []);
      const [users, all, done, inc, anom, q, fail, mats, quotes, pricing] = await Promise.all([
        adminListUsers(t).catch(() => []),
        adminListRequests(t).catch(() => []),
        settle(),
        adminListIncidents(t, 'OPEN').catch(() => []),
        adminListAnomalies(t).catch(() => []),
        adminAllbaroQueue(t).catch(() => []),
        adminAllbaroFailures(t).catch(() => []),
        adminWasteMaterials(t).catch(() => []),
        adminQuotesSummary(t).catch(() => []),
        adminListPricing(t).catch(() => []),
      ]);
      setAllUsers(users);
      setRequests(all);
      setSettleQueue(done);
      setIncidents(inc);
      setAnomalies(anom);
      setQueue(q);
      setFailures(fail);
      setWasteMaterials(mats);
      setQuotesSummary(quotes);
      setPricingRows(pricing);
    } catch (err) {
      setError(message(err, '조회에 실패했습니다. 관리자 계정으로 로그인했는지 확인해 주세요.'));
      setReady(false);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // 최초 진입은 로그인 세션으로 시도한다(토큰 칸은 아직 비어 있다).
  // 실패하면 인증 카드가 뜨고, 그때부터는 '다시 조회' 버튼이 부른다.
  // ⚠️ load 를 의존성에 넣으면 토큰을 한 글자 칠 때마다 전체 조회가 나간다.
  const initialLoad = useRef(load);
  initialLoad.current = load;
  useEffect(() => {
    void initialLoad.current();
  }, []);

  /** 위험한 동작은 한 번 되묻는다 — 되돌릴 수 없는 것들이라. */
  function confirmThen(title: string, body: string, run: () => void) {
    Alert.alert(title, body, [
      { text: '취소', style: 'cancel' },
      { text: '실행', style: 'destructive', onPress: run },
    ]);
  }

  async function act<T>(id: string, fn: () => Promise<T>, fallback: string): Promise<T | undefined> {
    setBusyId(id);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(message(err, fallback));
      return undefined;
    } finally {
      setBusyId(null);
    }
  }

  const t = () => token.trim();

  // ── 승인·권한 ────────────────────────────────────────────────────────────
  async function decide(userId: string, status: 'APPROVED' | 'SUSPENDED') {
    const ok = await act(userId, () => adminSetApproval(t(), userId, status), '처리에 실패했습니다.');
    if (ok) setPending((prev) => prev.filter((u) => u.id !== userId));
  }

  async function setRole(user: UserProfile, role: 'ADMIN' | 'MEMBER') {
    const updated = await act(user.id, () => adminSetRole(t(), user.id, role), '권한 변경에 실패했습니다.');
    if (updated) setAllUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
  }

  // ── 요청 제어 ────────────────────────────────────────────────────────────
  async function force(request: ServiceRequest, to: MatchStatus) {
    const reason = (reasons[request.id] ?? '').trim();
    if (!reason) {
      setError('개입 사유를 먼저 입력해 주세요. 사유 없이는 바꿀 수 없습니다.');
      return;
    }
    const updated = await act(
      request.id,
      () => adminForceStatus(t(), request.id, to, reason),
      '상태 변경에 실패했습니다.',
    );
    if (updated) {
      setRequests((prev) => prev.map((r) => (r.id === request.id ? updated : r)));
      setReasons((prev) => ({ ...prev, [request.id]: '' }));
    }
  }

  async function settle(requestId: string) {
    const ok = await act(
      requestId,
      () => adminExecutePayout(t(), requestId, todayKST()),
      '정산 실행에 실패했습니다.',
    );
    if (ok) setSettleQueue((prev) => prev.filter((r) => r.id !== requestId));
  }

  // ── 분쟁 ─────────────────────────────────────────────────────────────────
  async function resolve(incident: AdminIncident) {
    const note = (reasons[incident.id] ?? '').trim();
    if (!note) {
      setError('처리 내용을 입력해 주세요.');
      return;
    }
    const ok = await act(
      incident.id,
      () => adminResolveIncident(t(), incident.id, note),
      '분쟁 처리에 실패했습니다.',
    );
    if (ok) setIncidents((prev) => prev.filter((i) => i.id !== incident.id));
  }

  // ── 올바로 ───────────────────────────────────────────────────────────────
  async function retryAll() {
    const summary = await act('retry-all', () => adminAllbaroRetryNow(t()), '재시도에 실패했습니다.');
    if (summary) {
      setQueue(await adminAllbaroQueue(t()).catch(() => []));
      setFailures(await adminAllbaroFailures(t()).catch(() => []));
      Alert.alert(
        '재시도 완료',
        `성공 ${summary.succeeded} · 재적재 ${summary.requeued} · 소진 ${summary.exhausted}`,
      );
    }
  }

  async function retryOne(item: AdminRetryItem) {
    const ok = await act(item.id, () => adminAllbaroRetryOne(t(), item.id), '재처리에 실패했습니다.');
    if (ok) {
      setQueue(await adminAllbaroQueue(t()).catch(() => []));
      setFailures(await adminAllbaroFailures(t()).catch(() => []));
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기"
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>관리자</Text>
      </View>

      {/* 가로 스크롤 탭. 부모가 세로 flex 라 감싸주지 않으면 ScrollView 가 늘어나
          라벨이 위아래로 잘린다(실제로 그랬다). */}
      <View style={styles.tabBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
        >
          {TABS.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item.key }}
              onPress={() => setTab(item.key)}
              style={[styles.tab, tab === item.key && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, tab === item.key && styles.tabLabelActive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!ready ? (
          <Card>
            <Text style={styles.name}>관리자 인증</Text>
            <Text style={styles.meta}>
              관리자 계정으로 로그인했다면 그대로 &apos;다시 조회&apos;를 누르세요. 계정이 없거나
              잠겼을 때만 공유 운영 토큰을 입력합니다.
            </Text>
            <Field
              label="공유 운영 토큰 (선택)"
              value={token}
              onChangeText={setToken}
              placeholder="비워두면 로그인 계정으로 접속"
              secureTextEntry
              autoCapitalize="none"
            />
          </Card>
        ) : null}

        <AppButton label="다시 조회" onPress={load} loading={loading} />
        <ErrorBanner message={error} />

        {ready && tab === 'approval' ? (
          <>
            <SectionTitle>승인 대기 ({pending.length})</SectionTitle>
            {pending.length === 0 ? (
              <Text style={styles.empty}>승인 대기 중인 업체가 없어요.</Text>
            ) : (
              pending.map((u, i) => (
                <FadeInUp key={u.id} delay={Math.min(i, 6) * 60}>
                  <Card>
                    <Text style={styles.name}>{u.name}</Text>
                    <Text style={styles.meta}>
                      {USER_TYPE_LABELS[u.userType] ?? u.userType}
                      {u.businessNumber ? ` · 사업자 ${formatBusinessNumber(u.businessNumber)}` : ''}
                    </Text>
                    <Text style={styles.meta}>
                      {u.allbaroCertified ? '✓ 올바로 인증' : '올바로 미인증'}
                    </Text>
                    <View style={styles.actions}>
                      <AppButton
                        label="승인"
                        onPress={() => decide(u.id, 'APPROVED')}
                        loading={busyId === u.id}
                        style={styles.actionBtn}
                      />
                      <View style={{ width: theme.spacing.sm }} />
                      <AppButton
                        label="거절"
                        variant="danger"
                        onPress={() => decide(u.id, 'SUSPENDED')}
                        loading={busyId === u.id}
                        style={styles.actionBtn}
                      />
                    </View>
                  </Card>
                </FadeInUp>
              ))
            )}

            <SectionTitle>계정 권한</SectionTitle>
            <Text style={styles.meta}>
              관리자로 지정하면 로그인만으로 이 화면에 들어옵니다. 누가 무엇을 했는지 서버에
              남으므로, 공유 토큰 대신 계정을 쓰는 편이 안전합니다.
            </Text>
            {allUsers.slice(0, 40).map((u) => (
              <Card key={u.id}>
                <Text style={styles.name}>
                  {u.name}
                  {u.role === 'ADMIN' ? '  · 관리자' : ''}
                </Text>
                <Text style={styles.meta}>
                  {USER_TYPE_LABELS[u.userType] ?? u.userType} · {u.approvalStatus}
                </Text>
                <View style={styles.actions}>
                  {u.role === 'ADMIN' ? (
                    <AppButton
                      label="관리자 해제"
                      variant="danger"
                      loading={busyId === u.id}
                      style={styles.actionBtn}
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
                      style={styles.actionBtn}
                      onPress={() =>
                        confirmThen(
                          '관리자 지정',
                          `${u.name} 님이 백오피스 전체를 쓸 수 있게 됩니다.`,
                          () => void setRole(u, 'ADMIN'),
                        )
                      }
                    />
                  )}
                </View>
              </Card>
            ))}
          </>
        ) : null}

        {ready && tab === 'requests' ? (
          <>
            <SectionTitle>정산 대기 ({settleQueue.length})</SectionTitle>
            {settleQueue.length === 0 ? (
              <Text style={styles.empty}>정산할 완료 건이 없어요.</Text>
            ) : (
              settleQueue.map((r) => (
                <Card key={r.id}>
                  <Text style={styles.name}>{REQUEST_KIND_LABELS[r.kind]}</Text>
                  <Text style={styles.meta}>
                    {r.agreedFee !== undefined
                      ? `${r.agreedFee.toLocaleString('ko-KR')}원`
                      : '금액 미확정'}
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

            <SectionTitle>요청 개입 ({requests.length})</SectionTitle>
            <Text style={styles.meta}>
              업체가 잠수하거나 연락이 끊겨 멈춘 요청을 정리합니다. 정상 규칙을 건너뛰므로
              사유가 반드시 남습니다. 정산완료 건은 되돌릴 수 없습니다.
            </Text>
            {requests.slice(0, 30).map((r) => (
              <Card key={r.id}>
                <Text style={styles.name}>
                  {REQUEST_KIND_LABELS[r.kind]} · {REQUEST_STATUS_LABELS[r.status]}
                </Text>
                <Text style={styles.meta}>
                  {r.region} · {r.wasteTons}톤
                  {r.matchedProviderId ? ' · 매칭됨' : ' · 미매칭'}
                </Text>
                {r.status === 'SETTLED' ? (
                  <Text style={styles.meta}>정산이 끝난 건이라 변경할 수 없습니다.</Text>
                ) : (
                  <>
                    <View style={styles.spacer} />
                    <Field
                      label="개입 사유 (필수)"
                      value={reasons[r.id] ?? ''}
                      onChangeText={(v) => setReasons((prev) => ({ ...prev, [r.id]: v }))}
                      placeholder="예) 업체 연락두절 3일, 배출자 요청으로 취소"
                    />
                    <View style={styles.chipRow}>
                      {FORCE_TARGETS.filter((s) => s !== r.status).map((s) => (
                        <Pressable
                          key={s}
                          accessibilityRole="button"
                          style={styles.chip}
                          onPress={() =>
                            confirmThen(
                              '상태 강제 변경',
                              `${REQUEST_STATUS_LABELS[r.status]} → ${REQUEST_STATUS_LABELS[s]} 로 바꿉니다.`,
                              () => void force(r, s),
                            )
                          }
                        >
                          <Text style={styles.chipLabel}>{REQUEST_STATUS_LABELS[s]}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
              </Card>
            ))}
          </>
        ) : null}

        {ready && tab === 'incidents' ? (
          <>
            <SectionTitle>미처리 분쟁 ({incidents.length})</SectionTitle>
            {incidents.length === 0 ? (
              <Text style={styles.empty}>미처리 분쟁이 없어요.</Text>
            ) : (
              incidents.map((inc) => (
                <Card key={inc.id}>
                  <Text style={styles.name}>{inc.kind}</Text>
                  <Text style={styles.meta}>{inc.note ?? '내용 없음'}</Text>
                  <Field
                    label="처리 내용 (필수)"
                    value={reasons[inc.id] ?? ''}
                    onChangeText={(v) => setReasons((prev) => ({ ...prev, [inc.id]: v }))}
                    placeholder="예) 양측 합의, 위약금 면제"
                  />
                  <AppButton
                    label="처리 완료"
                    onPress={() => void resolve(inc)}
                    loading={busyId === inc.id}
                  />
                </Card>
              ))
            )}

            <SectionTitle>이상거래 탐지 ({anomalies.length})</SectionTitle>
            <Text style={styles.meta}>룰 기반 탐지 결과입니다. 조치 여부는 사람이 판단합니다.</Text>
            {anomalies.length === 0 ? (
              <Text style={styles.empty}>탐지된 이상 패턴이 없어요.</Text>
            ) : (
              anomalies.map((a, i) => (
                <Card key={`${a.kind}-${i}`}>
                  <Text style={styles.name}>{a.kind}</Text>
                  <Text style={styles.meta}>{a.message}</Text>
                </Card>
              ))
            )}
          </>
        ) : null}

        {ready && tab === 'allbaro' ? (
          <>
            <SectionTitle>재시도 큐 ({queue.length})</SectionTitle>
            <Text style={styles.meta}>
              발행에 실패한 전자인계서입니다. 5분마다 자동으로 재시도하며, 아래 버튼으로
              지금 바로 처리할 수도 있습니다.
            </Text>
            <AppButton label="지금 재시도" onPress={retryAll} loading={busyId === 'retry-all'} />
            {queue.length === 0 ? (
              <Text style={styles.empty}>큐가 비어 있어요.</Text>
            ) : (
              queue.map((item) => (
                <Card key={item.id}>
                  <Text style={styles.name}>{item.matchRequestId}</Text>
                  <Text style={styles.meta}>
                    {item.status} · 시도 {item.attempts}/{item.maxAttempts}
                    {item.lastError ? ` · ${item.lastError}` : ''}
                  </Text>
                </Card>
              ))
            )}

            <SectionTitle>수동 재처리 대상 ({failures.length})</SectionTitle>
            <Text style={styles.meta}>
              재시도를 다 쓴 건입니다. 법정 신고 의무가 걸린 건이라 그대로 두면 안 됩니다.
            </Text>
            {failures.length === 0 ? (
              <Text style={styles.empty}>소진된 건이 없어요.</Text>
            ) : (
              failures.map((item) => (
                <Card key={item.id}>
                  <Text style={styles.name}>{item.matchRequestId}</Text>
                  <Text style={styles.meta}>{item.lastError ?? '사유 없음'}</Text>
                  <AppButton
                    label="다시 시도"
                    onPress={() => void retryOne(item)}
                    loading={busyId === item.id}
                  />
                </Card>
              ))
            )}
          </>
        ) : null}

        {ready && tab === 'stats' ? (
          <>
            <SectionTitle>소재별 입력 현황</SectionTitle>
            <Card>
              {wasteMaterials.length === 0 ? (
                <Text style={styles.empty}>집계된 소재가 없어요.</Text>
              ) : (
                wasteMaterials.map((m) => (
                  <View key={m.material} style={styles.row}>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {m.label}
                    </Text>
                    <Text style={styles.rowValue}>
                      {Math.round(m.totalKg / 1000).toLocaleString('ko-KR')}톤 · {m.itemCount}건
                    </Text>
                  </View>
                ))
              )}
            </Card>

            <SectionTitle>견적 제출 현황</SectionTitle>
            <Card>
              {quotesSummary.length === 0 ? (
                <Text style={styles.empty}>제출된 견적이 없어요.</Text>
              ) : (
                quotesSummary.slice(0, 20).map((q) => (
                  <View key={q.requestId} style={styles.row}>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {q.requestId.slice(0, 8)}
                    </Text>
                    <Text style={styles.rowValue}>{q.quoteCount}건</Text>
                  </View>
                ))
              )}
            </Card>

            <SectionTitle>업체 단가 설정</SectionTitle>
            <Card>
              {pricingRows.length === 0 ? (
                <Text style={styles.empty}>등록된 단가가 없어요.</Text>
              ) : (
                pricingRows.slice(0, 20).map((p) => (
                  <View key={p.userId} style={styles.row}>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {p.userId.slice(0, 8)}
                    </Text>
                    <Text style={styles.rowValue}>
                      {p.unitPrice.toLocaleString('ko-KR')}원
                    </Text>
                  </View>
                ))
              )}
            </Card>

            <SectionTitle>전체 요청 ({requests.length})</SectionTitle>
            <Card>
              {requests.slice(0, 30).map((r) => (
                <View key={r.id} style={styles.row}>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {REQUEST_KIND_LABELS[r.kind]} · {r.region}
                  </Text>
                  <Text style={styles.rowValue}>{REQUEST_STATUS_LABELS[r.status]}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: theme.touch.primaryButtonHeight + spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 999,
    height: theme.touch.minButtonHeight,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: theme.touch.minButtonHeight,
  },
  backChevron: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    lineHeight: font.title + 2,
  },
  headerTitle: { color: colors.text, fontSize: font.title, fontWeight: '800' },
  tabBarWrap: { flexGrow: 0, flexShrink: 0 },
  tabBar: { paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  tab: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 8,
    justifyContent: 'center',
    marginRight: spacing.xs,
    minHeight: theme.touch.minButtonHeight,
    paddingHorizontal: spacing.sm,
  },
  tabActive: { backgroundColor: colors.primary },
  tabLabel: { color: colors.textMuted, fontSize: font.body, fontWeight: '700' },
  tabLabelActive: { color: '#ffffff' },
  content: { padding: spacing.md, paddingBottom: spacing.lg },
  empty: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.md },
  name: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.xs / 2 },
  actions: { flexDirection: 'row', marginTop: spacing.sm },
  actionBtn: { flex: 1 },
  spacer: { height: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 8,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    marginRight: spacing.xs,
    minHeight: theme.touch.minButtonHeight,
    paddingHorizontal: spacing.sm,
  },
  chipLabel: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    color: colors.text,
    flex: 1,
    fontSize: font.body,
    fontWeight: '700',
    marginRight: spacing.sm,
  },
  rowValue: { color: colors.textMuted, fontSize: font.body, fontWeight: '700' },
});
