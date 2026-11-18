import React from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { COMPANY_INFO, SUPPORT_PHONE_TEL_URL } from '@dimol/shared';
import { WEB_BASE_URL } from '../api/client';
import { useWideLayout } from '../lib/layout';
import { theme } from '../theme';
import brandmark from '../../assets/brandmark.png';

/**
 * 사업자 정보 푸터 — 전자상거래법 제10조 표시사항 + PG(KG이니시스) 심사 요건.
 *
 * 통신판매중개 서비스는 상호·대표자·주소·사업자등록번호·통신판매업신고번호를
 * 소비자가 볼 수 있는 곳에 띄워야 하고, PG 심사는 여기에 **고객센터 전화번호**와
 * **호스팅 서비스 제공자**까지 확인한다. 로그인 전 첫 화면에도 보여야 해서 화면 공용 컴포넌트로 둔다.
 *
 * 값이 아직 안 채워진 항목은 **비워 두고 숨긴다** — 없는 번호를 만들어 띄우는 것이
 * 표시 누락보다 나쁘다([[constants]] COMPANY_INFO).
 */
export function CompanyInfoFooter({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  // 홈페이지 맨 아래는 회사 사이트처럼 먹색 띠(dark). 앱 안 화면에 붙일 때는 흰 바탕(light).
  const dark = tone === 'dark';
  const wide = useWideLayout();
  const rows = [
    { label: '상호', value: COMPANY_INFO.name },
    { label: '대표자', value: COMPANY_INFO.representative },
    { label: '사업자등록번호', value: COMPANY_INFO.businessNumber },
    { label: '통신판매업신고', value: COMPANY_INFO.mailOrderNumber },
    { label: '주소', value: COMPANY_INFO.address },
    { label: '이메일', value: COMPANY_INFO.email },
    { label: '개인정보 보호책임자', value: COMPANY_INFO.privacyOfficer },
    { label: '호스팅 서비스', value: COMPANY_INFO.hostingProvider },
  ].filter((row) => row.value.length > 0);

  const muted = dark && styles.onDarkMuted;
  return (
    <View style={[styles.footer, dark && styles.footerDark]}>
      <View style={[styles.inner, wide && styles.innerWide]}>
        {dark ? (
          <View style={styles.brandRow}>
            <Image source={brandmark} style={styles.brandLogo} resizeMode="contain" />
            <Text style={styles.brandText}>{COMPANY_INFO.serviceName}</Text>
          </View>
        ) : null}
        <View style={[styles.links, dark && styles.linksDark]}>
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(`${WEB_BASE_URL}/terms`)}
            style={styles.link}
          >
            <Text style={[styles.linkText, dark && styles.onDarkStrong]}>이용약관</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(`${WEB_BASE_URL}/privacy`)}
            style={styles.link}
          >
            {/* 개인정보처리방침은 법적으로 다른 항목보다 눈에 띄게 둔다(굵게). */}
            <Text style={[styles.linkText, styles.linkStrong, dark && styles.onDarkStrong]}>
              개인정보처리방침
            </Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(SUPPORT_PHONE_TEL_URL)}
          style={styles.phoneRow}
        >
          <Text style={[styles.phone, dark && styles.phoneDark]}>
            고객센터 {COMPANY_INFO.supportPhone}
          </Text>
        </Pressable>
        <View style={wide ? styles.rowsWide : undefined}>
          {rows.map((row) => (
            <Text key={row.label} style={[styles.line, wide && styles.lineWide, muted]}>
              {row.label} {row.value}
            </Text>
          ))}
        </View>
        <Text style={[styles.notice, muted]}>
          {COMPANY_INFO.name}은(는) 통신판매중개자로서 매칭 거래의 당사자가 아니며, 업체가 등록한
          용역 정보와 작업 결과에 대한 책임은 해당 업체에 있습니다.
        </Text>
        <Text style={[styles.version, muted]}>
          © {COMPANY_INFO.name} · {COMPANY_INFO.serviceName} v1.0.0
        </Text>
      </View>
    </View>
  );
}

const { colors, font, spacing, touch } = theme;

const styles = StyleSheet.create({
  footer: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  footerDark: {
    backgroundColor: colors.text,
    borderTopWidth: 0,
    marginTop: 0,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  inner: {
    alignSelf: 'center',
    width: '100%',
  },
  innerWide: {
    maxWidth: theme.wideContentWidth - spacing.md * 2,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  brandLogo: { height: 32, width: 32 },
  brandText: {
    color: colors.background,
    fontSize: font.title,
    fontWeight: '700',
    letterSpacing: theme.tracking.title,
  },
  linksDark: {
    borderBottomColor: theme.onDark.divider,
    borderBottomWidth: 1,
    marginBottom: spacing.sm,
    marginTop: 0,
    paddingBottom: spacing.xs,
  },
  linkStrong: { textDecorationLine: 'none' },
  onDarkStrong: { color: colors.background, textDecorationLine: 'none' },
  onDarkMuted: { color: theme.onDark.textMuted },
  phoneDark: { color: colors.background, fontSize: font.bodyLarge },
  rowsWide: { columnGap: spacing.md, flexDirection: 'row', flexWrap: 'wrap' },
  lineWide: { marginRight: spacing.sm },
  phoneRow: {
    justifyContent: 'center',
    minHeight: touch.minButtonHeight,
  },
  phone: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  line: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  link: {
    justifyContent: 'center',
    minHeight: touch.minButtonHeight,
  },
  linkText: {
    color: colors.text,
    fontSize: font.caption,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  notice: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
    marginTop: spacing.sm,
  },
  version: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.sm,
  },
});
