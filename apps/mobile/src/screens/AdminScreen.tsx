import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  USER_TYPE_LABELS,
  formatBusinessNumber,
  type ProviderPricing,
  type ServiceRequest,
  type UserProfile,
} from '@dimol/shared';
import {
  ApiError,
  adminExecutePayout,
  adminListPricing,
  adminListRequests,
  adminListUsers,
  adminQuotesSummary,
  adminSetApproval,
  adminWasteMaterials,
  type AdminQuoteSummaryRow,
  type AdminWasteMaterialRow,
} from '../api/client';
import { AppButton, Card, ErrorBanner, Field, SectionTitle } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { theme } from '../theme';

function todayKST(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 관리자 백오피스(파일럿) — 업체 승인 대기 큐.
 * 사용자 세션이 아니라 관리자 토큰(x-admin-token)으로 인증한다.
 * 승인해야 업체가 일감을 수락할 수 있다.
 */
export function AdminScreen({ onBack }: { onBack: () => void }) {
  const [token, setToken] = useState('');
  const [pending, setPending] = useState<UserProfile[] | null>(null);
  const [settleQueue, setSettleQueue] = useState<ServiceRequest[]>([]);
  const [matchingLog, setMatchingLog] = useState<ServiceRequest[]>([]);
  const [wasteMaterials, setWasteMaterials] = useState<AdminWasteMaterialRow[]>([]);
  const [quotesSummary, setQuotesSummary] = useState<AdminQuoteSummaryRow[]>([]);
  const [pricingRows, setPricingRows] = useState<ProviderPricing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setError(null);
    if (token.trim().length === 0) {
      setError('관리자 토큰을 입력해 주세요.');
      return;
    }
    setLoading(true);
    try {
      const t = token.trim();
      setPending(await adminListUsers(t, 'PENDING'));
      // 작업완료(COMPLETED) = 정산 대기 큐.
      setSettleQueue(await adminListRequests(t, 'COMPLETED').catch(() => []));
      // 확장 현황(개별 실패는 무시 — 화면은 뜬다).
      setMatchingLog(await adminListRequests(t).catch(() => []));
      setWasteMaterials(await adminWasteMaterials(t).catch(() => []));
      setQuotesSummary(await adminQuotesSummary(t).catch(() => []));
      setPricingRows(await adminListPricing(t).catch(() => []));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '조회에 실패했습니다.');
      setPending(null);
    } finally {
      setLoading(false);
    }
  }

  async function settle(requestId: string) {
    setBusyId(requestId);
    setError(null);
    try {
      await adminExecutePayout(token.trim(), requestId, todayKST());
      setSettleQueue((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '정산 실행에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  async function decide(userId: string, status: 'APPROVED' | 'SUSPENDED') {
    setBusyId(userId);
    setError(null);
    try {
      await adminSetApproval(token.trim(), userId, status);
      setPending((prev) => (prev ? prev.filter((u) => u.id !== userId) : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '처리에 실패했습니다.');
    } finally {
      setBusyId(null);
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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>업체 승인 · 정산</Text>

        <Field
          label="관리자 토큰"
          value={token}
          onChangeText={setToken}
          placeholder="x-admin-token"
          secureTextEntry
          autoCapitalize="none"
        />
        <AppButton label="승인 대기 조회" onPress={load} loading={loading} />

        <ErrorBanner message={error} />

        {pending !== null ? <SectionTitle>승인 대기</SectionTitle> : null}
        {pending !== null ? (
          pending.length === 0 ? (
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
                  {u.phone ? ` · ${u.phone}` : ''}
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
          )
        ) : null}

        {pending !== null ? (
          <>
            <SectionTitle>정산 대기 (작업완료)</SectionTitle>
            {settleQueue.length === 0 ? (
              <Text style={styles.empty}>정산할 완료 건이 없어요.</Text>
            ) : (
              settleQueue.map((r, i) => (
                <FadeInUp key={r.id} delay={Math.min(i, 6) * 60}>
                  <Card>
                    <Text style={styles.name}>{REQUEST_KIND_LABELS[r.kind]}</Text>
                    <Text style={styles.meta}>
                      {r.agreedFee !== undefined ? `${r.agreedFee.toLocaleString('ko-KR')}원` : '금액 미확정'}
                      {` · ${r.wasteTons}톤`}
                    </Text>
                    <AppButton
                      label="정산 실행(지급)"
                      onPress={() => settle(r.id)}
                      loading={busyId === r.id}
                    />
                  </Card>
                </FadeInUp>
              ))
            )}
          </>
        ) : null}

        {pending !== null ? (
          <>
            <SectionTitle>소재별 kg 입력 현황</SectionTitle>
            {wasteMaterials.length === 0 ? (
              <Text style={styles.empty}>집계할 소재 데이터가 없어요.</Text>
            ) : (
              <Card>
                {wasteMaterials.map((row) => (
                  <View key={row.material} style={styles.row}>
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    <Text style={styles.rowValue}>
                      {row.totalKg.toLocaleString('ko-KR')}kg · {row.itemCount}건
                    </Text>
                  </View>
                ))}
              </Card>
            )}

            <SectionTitle>밀봉 견적 현황 (건수)</SectionTitle>
            {quotesSummary.length === 0 ? (
              <Text style={styles.empty}>제출된 견적이 없어요.</Text>
            ) : (
              <Card>
                {/* 금액은 노출하지 않는다(밀봉). 요청별 제출 건수만. */}
                {quotesSummary.map((row) => (
                  <View key={row.requestId} style={styles.row}>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      요청 {row.requestId.slice(0, 8)}…
                    </Text>
                    <Text style={styles.rowValue}>견적 {row.quoteCount}건</Text>
                  </View>
                ))}
              </Card>
            )}

            <SectionTitle>단가 설정 현황</SectionTitle>
            {pricingRows.length === 0 ? (
              <Text style={styles.empty}>단가를 설정한 업체가 없어요.</Text>
            ) : (
              <Card>
                {pricingRows.map((row) => (
                  <View key={row.userId} style={styles.row}>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {row.userId.slice(0, 8)}…
                    </Text>
                    <Text style={styles.rowValue}>{row.unitPrice.toLocaleString('ko-KR')}원</Text>
                  </View>
                ))}
              </Card>
            )}

            <SectionTitle>매칭 로그</SectionTitle>
            {matchingLog.length === 0 ? (
              <Text style={styles.empty}>요청 로그가 없어요.</Text>
            ) : (
              <Card>
                {matchingLog.slice(0, 30).map((r) => (
                  <View key={r.id} style={styles.row}>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {REQUEST_KIND_LABELS[r.kind]} · {r.region}
                    </Text>
                    <Text style={styles.rowValue}>{REQUEST_STATUS_LABELS[r.status]}</Text>
                  </View>
                ))}
              </Card>
            )}
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
  backChevron: { color: colors.text, fontSize: font.title, fontWeight: '800', lineHeight: font.title + 2 },
  headerTitle: { color: colors.text, fontSize: font.title, fontWeight: '800' },
  content: { padding: spacing.md, paddingBottom: spacing.lg },
  title: { color: colors.text, fontSize: font.titleLarge, fontWeight: '800', marginBottom: spacing.md },
  empty: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.md },
  name: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.xs / 2 },
  actions: { flexDirection: 'row', marginTop: spacing.sm },
  actionBtn: { flex: 1 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  rowLabel: { color: colors.text, fontSize: font.body, fontWeight: '700', flex: 1, marginRight: spacing.sm },
  rowValue: { color: colors.textMuted, fontSize: font.body, fontWeight: '700' },
});
