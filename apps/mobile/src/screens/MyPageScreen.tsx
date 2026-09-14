import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import {
  CALL_AVAILABILITY_LABELS,
  COMPANY_INFO,
  formatPhoneForDisplay,
  SUPPORT_PHONE,
  SUPPORT_PHONE_TEL_URL,
  USER_APPROVAL_LABELS,
  isAdminUser,
  USER_TYPE_LABELS,
  isCompanyType,
  offersTransportLabel,
  pricingUnitLabel,
  usesOffersTransport,
  usesPricing,
  type RatingSummary,
} from '@dimol/shared';
import { getPricing, getRating, setOffersTransport, setPricing, WEB_BASE_URL } from '../api/client';
import { AppIcon } from '../components/AppIcon';
import {
  AppButton,
  Card,
  ErrorBanner,
  Field,
  InfoRow,
  KeyboardAwareScreen,
  SectionTitle,
} from '../components/ui';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, TabBar, useAuthActions, useNavigation, useSession } from '../navigation';
import { confirmDialog } from '../lib/dialog';
import { theme } from '../theme';

/** 내 정보 — 프로필·승인 상태·올바로 인증 배지·평점 (Phase 1~2). */

export function MyPageScreen() {
  const user = useSession();
  const nav = useNavigation();
  const { logout } = useAuthActions();
  const [rating, setRating] = useState<RatingSummary | null>(null);
  // 처리장 운반요청 제공 여부 — 세션 값으로 시작하고, 토글 시 로컬 상태로 반영(availability 패턴).
  const [offersTransport, setOffersTransportState] = useState(user.offersTransport ?? false);
  const [offersBusy, setOffersBusy] = useState(false);

  async function toggleOffersTransport() {
    const next = !offersTransport;
    setOffersBusy(true);
    try {
      const updated = await setOffersTransport(user.id, next);
      setOffersTransportState(updated.offersTransport ?? next);
    } catch {
      // 실패 시 상태를 유지한다(알림은 후속).
    } finally {
      setOffersBusy(false);
    }
  }

  // 업체 단가(마이페이지 설정) — 저장된 값을 불러와 입력칸 초기값으로.
  const [priceInput, setPriceInput] = useState('');
  const [priceSaved, setPriceSaved] = useState<number | null>(null);
  const [priceBusy, setPriceBusy] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceDone, setPriceDone] = useState(false);

  useEffect(() => {
    // 평점은 부가 정보 — 실패해도 화면은 뜬다.
    getRating(user.id)
      .then(setRating)
      .catch(() => setRating(null));
  }, [user.id]);

  useEffect(() => {
    if (!usesPricing(user.userType)) return;
    getPricing(user.id)
      .then((p) => {
        if (p) {
          setPriceSaved(p.unitPrice);
          setPriceInput(String(p.unitPrice));
        }
      })
      .catch(() => undefined);
  }, [user.id, user.userType]);

  async function savePricing() {
    setPriceError(null);
    setPriceDone(false);
    const value = Number(priceInput.replace(/\D/g, ''));
    if (!Number.isInteger(value) || value <= 0) {
      setPriceError('단가(원, 양의 정수)를 정확히 입력해 주세요.');
      return;
    }
    setPriceBusy(true);
    try {
      const saved = await setPricing(user.id, value);
      setPriceSaved(saved.unitPrice);
      setPriceInput(String(saved.unitPrice));
      setPriceDone(true);
    } catch {
      setPriceError('단가 저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setPriceBusy(false);
    }
  }

  // 로그아웃은 되돌릴 수 없고(자동 로그인 토큰이 지워진다) 바로 옆에 다른 링크가 있어
  // 잘못 누르기 쉽다 — 한 번 확인한다.
  async function confirmLogout() {
    const ok = await confirmDialog('로그아웃할까요?', '다시 이용하려면 휴대폰번호로 로그인해야 해요.');
    if (ok) logout();
  }

  return (
    <KeyboardAwareScreen style={styles.screen}>
      <ScreenHeader title="내 정보" />

      {/* Hero profile section — sits above ScrollView for sticky feel */}
      <FadeInUp delay={40}>
        <View style={styles.heroSection}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user.name.trim().charAt(0) || '비'}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.name}>{user.name}</Text>
              <Text style={styles.role}>
                {USER_TYPE_LABELS[user.userType] ?? user.userType} · {user.region}
              </Text>
            </View>
          </View>
          {(user.allbaroCertified || user.insuranceRegistered || user.permitRegistered) ? (
            <View style={styles.badgeRow}>
              {user.allbaroCertified ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>올바로 인증</Text>
                </View>
              ) : null}
              {user.insuranceRegistered ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>보험 가입</Text>
                </View>
              ) : null}
              {user.permitRegistered ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>허가증</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </FadeInUp>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SectionTitle>내 활동</SectionTitle>
        <Card style={styles.menuGroupCard}>
          <Pressable style={styles.menuItem} onPress={() => nav.switchTab('requests')}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconCircle}>
                <AppIcon name="document" size={18} color={theme.colors.primary} />
              </View>
              <Text style={styles.menuLabel}>내 요청 목록</Text>
            </View>
            <Text style={styles.arrowIcon}>›</Text>
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable style={styles.menuItem} onPress={() => nav.switchTab('notifications')}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconCircle}>
                <AppIcon name="notifications" size={18} color={theme.colors.primary} />
              </View>
              <Text style={styles.menuLabel}>알림</Text>
            </View>
            <Text style={styles.arrowIcon}>›</Text>
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable style={styles.menuItem} onPress={() => nav.push({ name: 'estimate' })}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconCircle}>
                <AppIcon name="tools" size={18} color={theme.colors.primary} />
              </View>
              <Text style={styles.menuLabel}>폐기물 양 계산</Text>
            </View>
            <Text style={styles.arrowIcon}>›</Text>
          </Pressable>
          {/* 업체만 — 소비자는 정산받을 일이 없다. 등록 전에는 정산금이 지급되지 않으므로
              가입 직후에 눈에 띄어야 한다. */}
          {user.userType !== 'CONSUMER' ? (
            <>
              <View style={styles.menuDivider} />
              <Pressable
                style={styles.menuItem}
                onPress={() => nav.push({ name: 'payoutAccount' })}
              >
                <View style={styles.menuLeft}>
                  <View style={styles.menuIconCircle}>
                    <AppIcon name="card" size={18} color={theme.colors.primary} />
                  </View>
                  <Text style={styles.menuLabel}>정산 계좌</Text>
                </View>
                <Text style={styles.arrowIcon}>›</Text>
              </Pressable>
            </>
          ) : null}
          <View style={styles.menuDivider} />
          <Pressable style={styles.menuItem} onPress={() => nav.push({ name: 'store' })}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconCircle}>
                <AppIcon name="star" size={18} color={theme.colors.primary} />
              </View>
              <Text style={styles.menuLabel}>스토어 · 멤버십</Text>
            </View>
            <Text style={styles.arrowIcon}>›</Text>
          </Pressable>
          {/* 관리자에게만 보인다. 백오피스에 로그인한 채로 들어가야 서버 감사 로그에
              "누가" 했는지가 남는다 — 공유 토큰으로 들어가면 그게 안 남는다. */}
          {isAdminUser(user) ? (
            <>
              <View style={styles.menuDivider} />
              <Pressable style={styles.menuItem} onPress={() => nav.push({ name: 'admin' })}>
                <View style={styles.menuLeft}>
                  <View style={styles.menuIconCircle}>
                    <AppIcon name="settings" size={18} color={theme.colors.primary} />
                  </View>
                  <Text style={styles.menuLabel}>관리자 백오피스</Text>
                </View>
                <Text style={styles.arrowIcon}>›</Text>
              </Pressable>
            </>
          ) : null}
        </Card>

        <SectionTitle>계정</SectionTitle>
        <Card>
          <InfoRow label="가입 상태" value={USER_APPROVAL_LABELS[user.approvalStatus]} />
          {user.availability ? (
            <InfoRow label="콜대기" value={CALL_AVAILABILITY_LABELS[user.availability]} />
          ) : null}
          {user.phone ? (
            <InfoRow label="연락처" value={formatPhoneForDisplay(user.phone)} />
          ) : null}
          <InfoRow label="가입일" value={new Date(user.createdAt).toLocaleDateString('ko-KR')} />
        </Card>

        {usesOffersTransport(user.userType) ? (
          <>
            <SectionTitle>운반요청 설정</SectionTitle>
            <Card>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: offersTransport, busy: offersBusy }}
                onPress={toggleOffersTransport}
                disabled={offersBusy}
                style={styles.toggleRow}
              >
                <View style={styles.toggleTextBox}>
                  <Text style={styles.toggleLabel}>운반요청도 함께 받기</Text>
                  <Text style={styles.toggleHint}>
                    {offersTransportLabel(offersTransport)} · 배출자에게 배지로 표시돼요
                  </Text>
                </View>
                <View style={[styles.switchTrack, offersTransport && styles.switchTrackOn]}>
                  <View style={[styles.switchThumb, offersTransport && styles.switchThumbOn]} />
                </View>
              </Pressable>
            </Card>
          </>
        ) : null}

        {usesPricing(user.userType) ? (
          <>
            <SectionTitle>내 단가</SectionTitle>
            <Card>
              <Field
                label={`기준 단가 (${pricingUnitLabel(user.userType)})`}
                value={priceInput}
                onChangeText={(v) => setPriceInput(v.replace(/[^0-9]/g, ''))}
                placeholder="예) 80000"
                keyboardType="number-pad"
                hint={
                  priceSaved !== null
                    ? `현재 저장된 단가: ${priceSaved.toLocaleString('ko-KR')}${pricingUnitLabel(user.userType)} · 견적 예상금액에 반영돼요`
                    : '견적 제출 시 예상 금액 기본값으로 쓰여요.'
                }
              />
              <ErrorBanner message={priceError} />
              {priceDone ? <Text style={styles.priceDone}>단가를 저장했어요</Text> : null}
              <AppButton label="단가 저장" onPress={savePricing} loading={priceBusy} />
            </Card>
          </>
        ) : null}

        {isCompanyType(user.userType) ? (
          <>
            <SectionTitle>평가</SectionTitle>
            {rating && rating.average !== null ? (
              <View style={styles.ratingRow}>
                <View style={styles.ratingCard}>
                  <Text style={styles.ratingNumber}>{rating.average}</Text>
                  <Text style={styles.ratingLabel}>평균 평점</Text>
                </View>
                <View style={styles.ratingCard}>
                  <Text style={styles.ratingNumber}>{rating.reviewCount}</Text>
                  <Text style={styles.ratingLabel}>리뷰 건수</Text>
                </View>
              </View>
            ) : (
              <Card>
                <InfoRow label="평균 평점" value="아직 평가가 없어요" />
              </Card>
            )}
          </>
        ) : null}

        <SectionTitle>지원</SectionTitle>
        <Card style={styles.menuGroupCard}>
          <Pressable
            style={styles.menuItem}
            onPress={() => Linking.openURL(`${WEB_BASE_URL}/terms`)}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconCircle}>
                <AppIcon name="document" size={18} color={theme.colors.primary} />
              </View>
              <Text style={styles.menuLabel}>이용약관</Text>
            </View>
            <Text style={styles.arrowIcon}>›</Text>
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable
            style={styles.menuItem}
            onPress={() => Linking.openURL(`${WEB_BASE_URL}/privacy`)}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconCircle}>
                <AppIcon name="lock" size={18} color={theme.colors.primary} />
              </View>
              <Text style={styles.menuLabel}>개인정보처리방침</Text>
            </View>
            <Text style={styles.arrowIcon}>›</Text>
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable
            style={styles.menuItem}
            accessibilityRole="button"
            accessibilityLabel={`고객센터 전화 ${SUPPORT_PHONE}`}
            onPress={() => Linking.openURL(SUPPORT_PHONE_TEL_URL)}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconCircle}>
                <AppIcon name="phone" size={18} color={theme.colors.primary} />
              </View>
              <View>
                <Text style={styles.menuLabel}>고객센터 전화 문의</Text>
                <Text style={styles.menuSubLabel}>{SUPPORT_PHONE}</Text>
              </View>
            </View>
            <Text style={styles.arrowIcon}>›</Text>
          </Pressable>
        </Card>

        <View style={{ height: theme.spacing.lg }} />
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

/**
 * 사업자 정보 푸터 — 전자상거래법 제10조 표시사항.
 *
 * 통신판매중개 서비스는 상호·대표자·주소·사업자등록번호·통신판매업신고번호를
 * 소비자가 볼 수 있는 곳에 띄워야 한다. 값이 아직 안 채워진 항목은 **비워 두고 숨긴다** —
 * 없는 번호를 만들어 띄우는 것이 표시 누락보다 나쁘다([[constants]] COMPANY_INFO).
 */
function CompanyInfoFooter() {
  const rows: { label: string; value: string }[] = [
    { label: '상호', value: COMPANY_INFO.name },
    { label: '대표자', value: COMPANY_INFO.representative },
    { label: '주소', value: COMPANY_INFO.address },
    { label: '사업자등록번호', value: COMPANY_INFO.businessNumber },
    { label: '통신판매업신고', value: COMPANY_INFO.mailOrderNumber },
    { label: '개인정보 보호책임자', value: COMPANY_INFO.privacyOfficer },
  ].filter((r) => r.value.length > 0);

  return (
    <View style={styles.companyFooter}>
      {rows.map((r) => (
        <Text key={r.label} style={styles.companyLine}>
          {r.label} {r.value}
        </Text>
      ))}
      <Text style={styles.companyLine}>고객센터 {SUPPORT_PHONE}</Text>
      <Text style={styles.companyNotice}>
        {COMPANY_INFO.serviceName}은 통신판매중개자로서 거래의 당사자가 아니며, 업체가 등록한
        상품·용역 정보와 시공 결과에 대한 책임은 해당 업체에 있습니다.
      </Text>
      <Text style={styles.companyVersion}>{COMPANY_INFO.serviceName} v1.0.0</Text>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.surface,
    flex: 1,
  },
  heroSection: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    padding: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  profileRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 999,
    height: 72,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 72,
  },
  avatarText: {
    color: colors.primary,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
  profileInfo: {
    flex: 1,
  },
  name: {
    color: colors.background,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
  role: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.badge,
    marginRight: spacing.xs,
    marginTop: spacing.xs / 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  badgeText: {
    color: colors.background,
    fontSize: font.caption,
    fontWeight: '700',
  },
  content: {
    padding: spacing.md,
    // 마지막 줄이 우하단 고객센터 버튼에 가리지 않게 밑단을 비운다.
    paddingBottom: theme.floatingButtonClearance + spacing.md,
  },
  menuGroupCard: {
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingVertical: spacing.xs,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuIconCircle: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 40,
  },
  menuIcon: {
    fontSize: font.body,
  },
  menuLabel: {
    fontSize: font.body,
    fontWeight: '700',
    color: colors.text,
  },
  menuSubLabel: {
    fontSize: font.caption,
    color: colors.textMuted,
    marginTop: spacing.xs / 2,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  arrowIcon: {
    fontSize: font.titleLarge,
    color: colors.textMuted,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  ratingCard: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.card,
    flex: 1,
    paddingVertical: spacing.md,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  ratingNumber: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
  ratingLabel: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: theme.touch.minButtonHeight,
  },
  toggleTextBox: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  toggleLabel: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  toggleHint: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
  },
  switchTrack: {
    width: 56,
    height: 32,
    borderRadius: 999,
    backgroundColor: colors.border,
    padding: spacing.xs / 2,
    justifyContent: 'center',
  },
  switchTrackOn: {
    backgroundColor: colors.primary,
  },
  switchThumb: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: colors.background,
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
  },
  priceDone: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.sm,
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
  companyFooter: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  companyLine: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
  },
  companyNotice: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
    marginTop: spacing.sm,
  },
  companyVersion: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.sm,
  },
});
