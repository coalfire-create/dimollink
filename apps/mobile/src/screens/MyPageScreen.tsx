import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  CALL_AVAILABILITY_LABELS,
  SUPPORT_PHONE,
  canUseStore,
  SUPPORT_PHONE_TEL_URL,
  USER_APPROVAL_LABELS,
  isAdminUser,
  isCompanyType,
  formatPhoneForDisplay,
} from '@dimol/shared';
import { WEB_BASE_URL } from '../api/client';
import { Card, InfoRow, KeyboardAwareScreen, SectionTitle } from '../components/ui';
import { MenuList, type MenuItem } from '../components/MenuList';
import { FadeInUp } from '../components/motion';
import { confirmDialog } from '../lib/dialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBar, useAuthActions, useNavigation, useSession } from '../navigation';
import { CompanyInfoFooter } from '../components/CompanyInfoFooter';
import { CompanySettings } from './mypage/CompanySettings';
import { ProfileHero } from './mypage/ProfileHero';
import { RatingCards } from './mypage/RatingCards';
import { theme } from '../theme';

/**
 * 내 정보 — 내가 누구인지, 어디로 갈 수 있는지, 무엇을 설정할 수 있는지.
 *
 * 이 파일은 **무엇을 어떤 순서로 놓을지**만 정한다. 가입 유형에 따라 통째로 빠지는
 * 블록이 여럿이라(업체 설정·평점·관리자 메뉴), 그 판단을 여기 한곳에 모아 둔다.
 */
export function MyPageScreen() {
  const user = useSession();
  const nav = useNavigation();
  const { logout } = useAuthActions();
  const insets = useSafeAreaInsets();

  // 로그아웃은 되돌릴 수 없고(자동 로그인 토큰이 지워진다) 바로 옆에 다른 링크가 있어
  // 잘못 누르기 쉽다 — 한 번 확인한다.
  async function confirmLogout() {
    const ok = await confirmDialog(
      '로그아웃할까요?',
      '다시 이용하려면 휴대폰번호로 로그인해야 해요.',
    );
    if (ok) logout();
  }

  // 예전엔 프로필 아래에 이용내역·알림 타일을 뒀는데 하단 탭과 같은 곳으로 가는 중복이라 뺐다.
  // 탭에 없는 곳(물량 계산·정산 계좌)만 아래 목록에 둔다.
  const isConsumer = user.userType === 'CONSUMER';

  const activityItems: MenuItem[] = [
    {
      key: 'estimate',
      icon: 'tools',
      label: '폐기물 양 계산',
      onPress: () => nav.push({ name: 'estimate' }),
    },
    // 소비자는 정산받을 일이 없다.
    ...(!isConsumer
      ? [
          {
            key: 'payout',
            icon: 'card',
            label: '정산 계좌',
            onPress: () => nav.push({ name: 'payoutAccount' }),
          } as MenuItem,
        ]
      : []),
    // 스토어는 살 수 있는 상품이 있는 회원에게만(지금은 철거업체 멤버십뿐) — [[canUseStore]].
    ...(canUseStore(user.userType)
      ? [
          {
            key: 'store',
            icon: 'star',
            label: '멤버십',
            onPress: () => nav.push({ name: 'store' }),
          } as MenuItem,
        ]
      : []),
    // 관리자에게만 보인다. 백오피스에 로그인한 채로 들어가야 서버 감사 로그에
    // "누가" 했는지가 남는다 — 공유 토큰으로 들어가면 그게 안 남는다.
    ...(isAdminUser(user)
      ? [
          {
            key: 'admin',
            icon: 'settings',
            label: '관리자 백오피스',
            onPress: () => nav.push({ name: 'admin' }),
          } as MenuItem,
        ]
      : []),
  ];

  const supportItems: MenuItem[] = [
    {
      key: 'terms',
      icon: 'document',
      label: '이용약관',
      onPress: () => void Linking.openURL(`${WEB_BASE_URL}/terms`),
    },
    {
      key: 'privacy',
      icon: 'lock',
      label: '개인정보처리방침',
      onPress: () => void Linking.openURL(`${WEB_BASE_URL}/privacy`),
    },
    {
      key: 'support',
      icon: 'phone',
      label: '고객센터 전화 문의',
      subLabel: SUPPORT_PHONE,
      accessibilityLabel: `고객센터 전화 ${SUPPORT_PHONE}`,
      onPress: () => void Linking.openURL(SUPPORT_PHONE_TEL_URL),
    },
  ];

  return (
    <KeyboardAwareScreen style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.pageTitle} accessibilityRole="header">
          내 정보
        </Text>
        <FadeInUp delay={40}>
          <ProfileHero user={user} />
        </FadeInUp>

        {/* 소비자는 타일로 다 올라가 남는 메뉴가 없다 — 빈 카드를 그리지 않는다. */}
        {activityItems.length > 0 ? (
          <>
            <SectionTitle>서비스</SectionTitle>
            <MenuList items={activityItems} />
          </>
        ) : null}

        <SectionTitle>계정</SectionTitle>
        <Card>
          <InfoRow label="가입 상태" value={USER_APPROVAL_LABELS[user.approvalStatus]} />
          {user.availability ? (
            <InfoRow label="콜대기" value={CALL_AVAILABILITY_LABELS[user.availability]} />
          ) : null}
          {user.phone ? <InfoRow label="연락처" value={formatPhoneForDisplay(user.phone)} /> : null}
          <InfoRow label="가입일" value={new Date(user.createdAt).toLocaleDateString('ko-KR')} />
        </Card>

        <CompanySettings user={user} />

        {isCompanyType(user.userType) ? <RatingCards userId={user.id} /> : null}

        <SectionTitle>지원</SectionTitle>
        <MenuList items={supportItems} />

        <View style={styles.spacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="로그아웃"
          onPress={() => void confirmLogout()}
          style={styles.logoutButton}
        >
          <Text style={styles.logoutText}>로그아웃</Text>
        </Pressable>

        <CompanyInfoFooter />
      </ScrollView>
      <TabBar active="mypage" />
    </KeyboardAwareScreen>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  spacer: {
    height: theme.spacing.lg,
  },
  screen: {
    backgroundColor: colors.appBackground,
    flex: 1,
  },
  pageTitle: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  content: {
    paddingHorizontal: spacing.sm,
    // 마지막 줄이 우하단 고객센터 버튼에 가리지 않게 밑단을 비운다.
    paddingBottom: theme.floatingButtonClearance + spacing.md,
  },
  logoutButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  logoutText: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
});
