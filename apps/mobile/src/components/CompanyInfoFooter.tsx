import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { COMPANY_INFO, SUPPORT_PHONE_TEL_URL } from '@dimol/shared';
import { WEB_BASE_URL } from '../api/client';
import { theme } from '../theme';

/**
 * 사업자 정보 푸터 — 전자상거래법 제10조 표시사항 + PG(토스페이먼츠) 심사 요건.
 *
 * 통신판매중개 서비스는 상호·대표자·주소·사업자등록번호·통신판매업신고번호를
 * 소비자가 볼 수 있는 곳에 띄워야 하고, 토스페이먼츠는 여기에 **고객센터 전화번호**까지
 * 요구한다. 로그인 전 첫 화면에도 보여야 해서 화면 공용 컴포넌트로 둔다.
 *
 * 값이 아직 안 채워진 항목은 **비워 두고 숨긴다** — 없는 번호를 만들어 띄우는 것이
 * 표시 누락보다 나쁘다([[constants]] COMPANY_INFO).
 */
export function CompanyInfoFooter() {
  const rows = [
    { label: '상호', value: COMPANY_INFO.name },
    { label: '대표자', value: COMPANY_INFO.representative },
    { label: '사업자등록번호', value: COMPANY_INFO.businessNumber },
    { label: '통신판매업신고', value: COMPANY_INFO.mailOrderNumber },
    { label: '주소', value: COMPANY_INFO.address },
    { label: '이메일', value: COMPANY_INFO.email },
    { label: '개인정보 보호책임자', value: COMPANY_INFO.privacyOfficer },
  ].filter((row) => row.value.length > 0);

  return (
    <View style={styles.footer}>
      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL(SUPPORT_PHONE_TEL_URL)}
        style={styles.phoneRow}
      >
        <Text style={styles.phone}>고객센터 {COMPANY_INFO.supportPhone}</Text>
      </Pressable>
      {rows.map((row) => (
        <Text key={row.label} style={styles.line}>
          {row.label} {row.value}
        </Text>
      ))}
      <View style={styles.links}>
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(`${WEB_BASE_URL}/terms`)}
          style={styles.link}
        >
          <Text style={styles.linkText}>이용약관</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(`${WEB_BASE_URL}/privacy`)}
          style={styles.link}
        >
          <Text style={styles.linkText}>개인정보처리방침</Text>
        </Pressable>
      </View>
      <Text style={styles.notice}>
        {COMPANY_INFO.name}은(는) 통신판매중개자로서 매칭 거래의 당사자가 아니며, 업체가 등록한 용역
        정보와 작업 결과에 대한 책임은 해당 업체에 있습니다.
      </Text>
      <Text style={styles.version}>{COMPANY_INFO.serviceName} v1.0.0</Text>
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
