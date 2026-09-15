import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COMPANY_INFO, SUPPORT_PHONE } from '@dimol/shared';
import { theme } from '../../theme';

/**
 * 사업자 정보 푸터 — 전자상거래법 제10조 표시사항.
 *
 * 통신판매중개 서비스는 상호·대표자·주소·사업자등록번호·통신판매업신고번호를
 * 소비자가 볼 수 있는 곳에 띄워야 한다. 값이 아직 안 채워진 항목은 **비워 두고 숨긴다** —
 * 없는 번호를 만들어 띄우는 것이 표시 누락보다 나쁘다([[constants]] COMPANY_INFO).
 */
export function CompanyInfoFooter() {
  const rows = [
    { label: '상호', value: COMPANY_INFO.name },
    { label: '대표자', value: COMPANY_INFO.representative },
    { label: '주소', value: COMPANY_INFO.address },
    { label: '사업자등록번호', value: COMPANY_INFO.businessNumber },
    { label: '통신판매업신고', value: COMPANY_INFO.mailOrderNumber },
    { label: '개인정보 보호책임자', value: COMPANY_INFO.privacyOfficer },
  ].filter((row) => row.value.length > 0);

  return (
    <View style={styles.footer}>
      {rows.map((row) => (
        <Text key={row.label} style={styles.line}>
          {row.label} {row.value}
        </Text>
      ))}
      <Text style={styles.line}>고객센터 {SUPPORT_PHONE}</Text>
      <Text style={styles.notice}>
        {COMPANY_INFO.serviceName}은 통신판매중개자로서 거래의 당사자가 아니며, 업체가 등록한
        상품·용역 정보와 시공 결과에 대한 책임은 해당 업체에 있습니다.
      </Text>
      <Text style={styles.version}>{COMPANY_INFO.serviceName} v1.0.0</Text>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  footer: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  line: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
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
