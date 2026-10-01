import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  CALL_AVAILABILITY_LABELS,
  SUPPORT_PHONE,
  SUPPORT_PHONE_TEL_URL,
  USER_APPROVAL_LABELS,
  isAdminUser,
  isCompanyType,
} from '@dimol/shared';
import { WEB_BASE_URL } from '../api/client';
import { Card, InfoRow, KeyboardAwareScreen, SectionTitle } from '../components/ui';
import { MenuList, type MenuItem } from '../components/MenuList';
import { FadeInUp } from '../components/motion';
import { confirmDialog } from '../lib/dialog';
import { ScreenHeader, TabBar, useAuthActions, useNavigation, useSession } from '../navigation';
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

  // 로그아웃은 되돌릴 수 없고(자동 로그인 토큰이 지워진다) 바로 옆에 다른 링크가 있어
  // 잘못 누르기 쉽다 — 한 번 확인한다.
  async function confirmLogout() {
    const ok = await confirmDialog(
      '로그아웃할까요?',
      '다시 이용하려면 휴대폰번호로 로그인해야 해요.',
    );
    if (ok) logout();
  }

  const activityItems: MenuItem[] = [
    {
      key: 'requests',
      icon: 'document',
      label: '내 요청 목록',
      onPress: () => nav.switchTab('requests'),
    },
    {
      key: 'notifications',
      icon: 'notifications',
      label: '알림',
      onPress: () => nav.switchTab('notifications'),
    },
    {
      key: 'estimate',
      icon: 'tools',
      label: '폐기물 양 계산',
      onPress: () => nav.push({ name: 'estimate' }),
    },
    // 업체만 — 소비자는 정산받을 일이 없다. 등록 전에는 정산금이 지급되지 않으므로
    // 가입 직후에 눈에 띄어야 한다.
    ...(user.userType !== 'CONSUMER'
      ? [
          {
            key: 'payout',
            icon: 'card',
            label: '정산 계좌',
            onPress: () => nav.push({ name: 'payoutAccount' }),
          } as MenuItem,
        ]
      : []),
    {
      key: 'store',
      icon: 'star',
      label: '스토어 · 멤버십',
      onPress: () => nav.push({ name: 'store' }),
    },
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
      <ScreenHeader title="내 정보" />

      {/* 프로필은 스크롤 밖에 둔다 — 어느 설정을 보고 있든 "누구의 화면인지"가 남는다. */}
      <FadeInUp delay={40}>
        <ProfileHero user={user} />
      </FadeInUp>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SectionTitle>내 활동</SectionTitle>
        <MenuList items={activityItems} />

        <SectionTitle>계정</SectionTitle>
        <Card>
          <InfoRow label="가입 상태" value={USER_APPROVAL_LABELS[user.approvalStatus]} />
          {user.availability ? (
            <InfoRow label="콜대기" value={CALL_AVAILABILITY_LABELS[user.availability]} />
          ) : null}
          {user.phone ? <InfoRow label="연락처" value={user.phone} /> : null}
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
    backgroundColor: colors.surface,
    flex: 1,
  },
  content: {
    padding: spacing.md,
    // 마지막 줄이 우하단 고객센터 버튼에 가리지 않게 밑단을 비운다.
    paddingBottom: theme.floatingButtonClearance + spacing.md,
  },
  logoutButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  logoutText: {
    color: colors.error,
    fontSize: font.body,
    fontWeight: '600',
  },
});
