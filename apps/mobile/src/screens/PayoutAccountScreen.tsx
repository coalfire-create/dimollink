import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { validatePayoutAccountInput, type SafePayoutAccount } from '@dimol/shared';
import {
  ApiError,
  getMyPayoutAccount,
  listBanks,
  savePayoutAccount,
} from '../api/client';
import { AppButton, Card, ErrorBanner, Field, SectionTitle,
  KeyboardAwareScreen,
} from '../components/ui';
import { ScreenHeader, useSession } from '../navigation';
import { theme } from '../theme';

/**
 * 정산 계좌 등록 — 업체가 정산금을 받을 곳.
 *
 * 화면이 반드시 지켜야 할 것:
 *  - 저장된 계좌번호를 **다시 보여주지 않는다**. 마스킹된 형태만 띄우고, 바꿀 때는
 *    새로 입력받는다. 원본을 화면에 띄우면 어깨너머로 새어나간다.
 *  - **예금주명은 사업자등록증 상호와 같아야 한다**. 다르면 PG 실명확인에서 떨어지는데,
 *    그 사실을 등록 시점에 알려주지 않으면 정산일에 가서야 알게 된다.
 */
export function PayoutAccountScreen() {
  const user = useSession();
  const [account, setAccount] = useState<SafePayoutAccount | null>(null);
  const [banks, setBanks] = useState<{ code: string; name: string }[]>([]);
  const [editing, setEditing] = useState(false);
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [holderName, setHolderName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const [bankList, mine] = await Promise.all([
        listBanks(),
        getMyPayoutAccount().catch(() => null),
      ]);
      setBanks(bankList);
      setAccount(mine);
      // 등록된 계좌가 없으면 바로 입력 화면으로 — 한 번 더 누르게 할 이유가 없다.
      setEditing(!mine);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '정산 계좌를 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setError(null);
    setSaved(false);
    const valid = validatePayoutAccountInput({ bankCode, accountNumber, holderName });
    if (!valid.ok) {
      setError(valid.error ?? '입력값을 확인해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const next = await savePayoutAccount({ bankCode, accountNumber, holderName });
      setAccount(next);
      setEditing(false);
      setSaved(true);
      // 원본을 앱 메모리에도 남기지 않는다.
      setAccountNumber('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const verificationText = (a: SafePayoutAccount) => {
    if (a.verification === 'VERIFIED') return '실명확인 완료 — 정산금을 받을 수 있어요.';
    if (a.verification === 'FAILED') {
      return `실명확인 실패 — 계좌 정보를 다시 확인해 주세요. (${a.verificationError ?? '사유 없음'})`;
    }
    return '실명확인 대기 중 — 확인이 끝나야 정산금이 지급됩니다.';
  };

  return (
    <KeyboardAwareScreen style={styles.screen}>
      <ScreenHeader title="정산 계좌" canGoBack />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} />
        {saved ? <Text style={styles.saved}>정산 계좌가 저장되었습니다.</Text> : null}

        {account && !editing ? (
          <Card>
            <Text style={styles.label}>등록된 계좌</Text>
            <Text style={styles.value}>
              {account.bankName ?? account.bankCode} {account.maskedAccountNumber}
            </Text>
            <Text style={styles.label}>예금주</Text>
            <Text style={styles.value}>{account.holderName}</Text>
            <Text
              style={[
                styles.verification,
                account.verification === 'VERIFIED' && styles.verified,
                account.verification === 'FAILED' && styles.failed,
              ]}
            >
              {verificationText(account)}
            </Text>
            <AppButton label="계좌 변경" variant="outline" onPress={() => setEditing(true)} />
          </Card>
        ) : null}

        {editing ? (
          <Card>
            <SectionTitle>{account ? '계좌 변경' : '정산 계좌 등록'}</SectionTitle>
            <Text style={styles.hint}>
              정산금을 받을 계좌입니다.{' '}
              <Text style={styles.strong}>예금주는 사업자등록증 상호와 같아야</Text> 실명확인을
              통과합니다. 계좌를 바꾸면 실명확인을 다시 받습니다.
            </Text>

            <Text style={styles.label}>은행</Text>
            <View style={styles.bankGrid}>
              {banks.map((bank) => (
                <Pressable
                  key={bank.code}
                  accessibilityRole="button"
                  accessibilityLabel={bank.name}
                  accessibilityState={{ selected: bankCode === bank.code }}
                  style={[styles.bank, bankCode === bank.code && styles.bankSelected]}
                  onPress={() => setBankCode(bank.code)}
                >
                  <Text
                    style={[styles.bankLabel, bankCode === bank.code && styles.bankLabelSelected]}
                  >
                    {bank.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Field
              label="계좌번호"
              required
              value={accountNumber}
              onChangeText={(v) => setAccountNumber(v.replace(/[^0-9]/g, ''))}
              placeholder="- 없이 숫자만"
              keyboardType="number-pad"
              maxLength={20}
            />
            <Field
              label="예금주"
              required
              value={holderName}
              onChangeText={setHolderName}
              placeholder="사업자등록증 상호와 동일하게"
              autoComplete="name"
            />

            <AppButton label="저장" onPress={save} loading={busy} disabled={busy} />
            {account ? (
              <AppButton label="취소" variant="outline" onPress={() => setEditing(false)} />
            ) : null}
          </Card>
        ) : null}
      </ScrollView>
    </KeyboardAwareScreen>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.lg },
  saved: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  hint: { color: colors.textMuted, fontSize: font.body, lineHeight: font.body * 1.5 },
  strong: { color: colors.text, fontWeight: '800' },
  label: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.sm },
  value: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '700' },
  verification: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '700',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  verified: { color: colors.primary },
  failed: { color: colors.error },
  bankGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
  bank: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 8,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    marginRight: spacing.xs,
    minHeight: theme.touch.minButtonHeight,
    paddingHorizontal: spacing.sm,
  },
  bankSelected: { backgroundColor: colors.primary },
  bankLabel: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  bankLabelSelected: { color: colors.background },
});
