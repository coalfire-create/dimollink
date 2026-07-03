import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PILOT, type UserProfile, type UserRole } from '@dimol/shared';
import { ApiError, createUser } from '../api/client';
import { AppButton, ErrorBanner, Field } from '../components/ui';
import { theme } from '../theme';

/**
 * 온보딩 — 역할 선택 후 가입 (Phase 1 /users).
 * 배출자는 즉시 승인, 업체는 사업자등록번호 검증 후 관리자 승인 대기.
 * 파일럿 지역은 양평 고정 — 지역 선택 UI를 두지 않는다.
 */

const ROLE_OPTIONS: Array<{ role: UserRole; title: string; description: string }> = [
  { role: 'DISCHARGER', title: '배출자', description: '철거·폐기물 처리를 맡기고 싶어요' },
  { role: 'DEMOLITION', title: '철거 업체', description: '철거 작업을 수주하고 싶어요' },
  { role: 'TRANSPORT', title: '운반 업체', description: '폐기물 운반 일감을 받고 싶어요' },
  { role: 'DISPOSAL', title: '처리장', description: '폐기물 반입 예약을 받고 싶어요' },
];

export function OnboardingScreen({ onComplete }: { onComplete: (user: UserProfile) => void }) {
  const [role, setRole] = useState<UserRole>('DISCHARGER');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isCompany = role !== 'DISCHARGER';

  async function submit() {
    setError(null);
    if (name.trim().length === 0) {
      setError(isCompany ? '업체명을 입력해 주세요.' : '이름을 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      const user = await createUser({
        role,
        name: name.trim(),
        region: PILOT.region,
        phone: phone.trim() || undefined,
        businessNumber: isCompany ? businessNumber.trim() : undefined,
      });
      onComplete(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '가입 처리에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.appName}>디몰링크</Text>
      <Text style={styles.tagline}>철거부터 폐기물 처리까지, 한 번에 연결해 드려요</Text>
      <Text style={styles.pilotNote}>지금은 {PILOT.region} 지역 건설폐기물만 서비스해요</Text>

      <Text style={styles.stepTitle}>어떤 일로 오셨나요?</Text>
      {ROLE_OPTIONS.map((option) => {
        const selected = role === option.role;
        return (
          <Pressable
            key={option.role}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => setRole(option.role)}
            style={[styles.roleCard, selected && styles.roleCardSelected]}
          >
            <Text style={[styles.roleTitle, selected && { color: theme.colors.primary }]}>
              {selected ? '✓ ' : ''}
              {option.title}
            </Text>
            <Text style={styles.roleDescription}>{option.description}</Text>
          </Pressable>
        );
      })}

      <View style={{ height: theme.spacing.md }} />
      <Field
        label={isCompany ? '업체명' : '이름'}
        value={name}
        onChangeText={setName}
        placeholder={isCompany ? '예) 양평철거(주)' : '예) 김양평'}
      />
      <Field
        label="연락처 (선택)"
        value={phone}
        onChangeText={setPhone}
        placeholder="010-0000-0000"
        keyboardType="phone-pad"
      />
      {isCompany ? (
        <Field
          label="사업자등록번호"
          value={businessNumber}
          onChangeText={setBusinessNumber}
          placeholder="000-00-00000"
          keyboardType="number-pad"
          hint="가입 후 관리자 승인이 끝나면 매칭을 받을 수 있어요."
        />
      ) : null}

      <ErrorBanner message={error} />
      <AppButton label="시작하기" onPress={submit} loading={submitting} />
    </ScrollView>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flexGrow: 1,
    padding: spacing.md,
  },
  appName: {
    color: colors.primary,
    fontSize: font.titleLarge,
    fontWeight: '800',
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  tagline: {
    color: colors.text,
    fontSize: font.body,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  pilotNote: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  stepTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  roleCard: {
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 2,
    marginBottom: spacing.xs,
    padding: spacing.sm,
  },
  roleCardSelected: {
    backgroundColor: '#E7F3EC',
    borderColor: colors.primary,
  },
  roleTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  roleDescription: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
});
