import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { adminListUsers } from '../api/client';
import { AppButton, Card, ErrorBanner, Field } from '../components/ui';
import { theme } from '../theme';
import { AllbaroTab } from './admin/AllbaroTab';
import { ApprovalTab } from './admin/ApprovalTab';
import { IncidentsTab } from './admin/IncidentsTab';
import { RequestsTab } from './admin/RequestsTab';
import { StatsTab } from './admin/StatsTab';
import { errorMessage } from './admin/shared';

/**
 * 관리자 백오피스 — 껍데기.
 *
 * 이 파일이 하는 일은 셋뿐이다: 인증 확인, 탭 전환, 오류 표시.
 * 각 탭은 자기 데이터를 직접 불러온다([[admin/shared]] 의 useAdminList) — 탭을 추가할 때
 * 여기를 고칠 필요가 없고, 승인 대기만 보러 온 사람이 올바로 큐까지 기다리지 않는다.
 *
 * 인증은 두 갈래다:
 *  - **관리자 계정 로그인**(권장): role=ADMIN 이면 토큰 칸을 비워둔다. 세션으로 들어가야
 *    서버 감사 로그에 "누가" 했는지가 남는다.
 *  - **공유 운영 토큰**: 첫 관리자를 만들 때와 계정이 잠겼을 때의 비상 경로.
 */

type TabKey = 'approval' | 'requests' | 'incidents' | 'allbaro' | 'stats';

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'approval', label: '승인·권한' },
  { key: 'requests', label: '요청 제어' },
  { key: 'incidents', label: '분쟁·이상' },
  { key: 'allbaro', label: '올바로' },
  { key: 'stats', label: '현황' },
];

export function AdminScreen({ onBack }: { onBack: () => void }) {
  const [token, setToken] = useState('');
  /** 인증에 쓸 확정 토큰. 입력칸을 그대로 넘기면 한 글자 칠 때마다 탭이 다시 조회한다. */
  const [activeToken, setActiveToken] = useState('');
  const [tab, setTab] = useState<TabKey>('approval');
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** 들어갈 수 있는지 가볍게 확인한다. 실패하면 토큰 입력 카드를 띄운다. */
  async function check(next: string) {
    setChecking(true);
    setError(null);
    try {
      await adminListUsers(next, 'PENDING');
      setActiveToken(next);
      setAuthed(true);
    } catch (err) {
      setAuthed(false);
      setError(
        errorMessage(err, '조회에 실패했습니다. 관리자 계정으로 로그인했는지 확인해 주세요.'),
      );
    } finally {
      setChecking(false);
    }
  }

  // 최초 진입은 로그인 세션으로 시도한다(토큰 칸은 아직 비어 있다).
  useEffect(() => {
    void check('');
  }, []);

  const tabProps = { token: activeToken, onError: setError };

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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
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
        {!authed ? (
          <Card>
            <Text style={styles.name}>관리자 인증</Text>
            <Text style={styles.meta}>
              관리자 계정으로 로그인했다면 그대로 &apos;다시 확인&apos;을 누르세요. 계정이 없거나
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
            <AppButton label="다시 확인" onPress={() => void check(token.trim())} loading={checking} />
          </Card>
        ) : null}

        <ErrorBanner message={error} />

        {authed && tab === 'approval' ? <ApprovalTab {...tabProps} /> : null}
        {authed && tab === 'requests' ? <RequestsTab {...tabProps} /> : null}
        {authed && tab === 'incidents' ? <IncidentsTab {...tabProps} /> : null}
        {authed && tab === 'allbaro' ? <AllbaroTab {...tabProps} /> : null}
        {authed && tab === 'stats' ? <StatsTab {...tabProps} /> : null}
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
  name: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.xs / 2 },
});
