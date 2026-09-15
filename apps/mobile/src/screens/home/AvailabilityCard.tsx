import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CALL_AVAILABILITY_LABELS, type CallAvailability } from '@dimol/shared';
import { setAvailability } from '../../api/client';
import { AppIcon } from '../../components/AppIcon';
import { AppButton, Card } from '../../components/ui';
import { useSession } from '../../navigation';
import { theme } from '../../theme';

/**
 * 콜대기 카드 — 운반업체가 지금 콜을 받을지, 얼마나 먼 곳까지 받을지.
 *
 * 반경 선택은 **꺼져 있을 때만** 보인다. 켜 둔 채로 반경을 바꾸면 그 사이에 들어온
 * 콜이 어느 반경 기준이었는지 흐려지고, 업체도 "방금 그 콜은 왜 왔지"가 된다.
 * 끄고 → 반경을 정하고 → 켜는 순서를 화면이 강제한다.
 */
export function AvailabilityCard({ onChanged }: { onChanged: () => void }) {
  const user = useSession();
  const [availability, setLocal] = useState<CallAvailability>(user.availability ?? 'OFFLINE');
  const [radiusKm, setRadiusKm] = useState(user.matchRadiusKm ?? 30);
  const [busy, setBusy] = useState(false);
  const online = availability === 'ONLINE';

  async function toggle() {
    const next: CallAvailability = online ? 'OFFLINE' : 'ONLINE';
    setBusy(true);
    try {
      const updated = await setAvailability(user.id, next, radiusKm);
      setLocal(updated.availability ?? next);
      onChanged();
    } catch {
      // 콜대기 토글 실패는 조용히 무시(다음 새로고침에 상태가 반영된다).
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={[styles.card, online && styles.cardOn]}>
      <View style={styles.headerRow}>
        <View style={styles.textBox}>
          <View style={styles.statusRow}>
            {/* 이모지(🟢/⚪)는 기기마다 크기·모양이 달라 글자와 줄이 안 맞았다. */}
            <View style={[styles.statusDot, online && styles.statusDotOn]} />
            <Text style={styles.status}>{CALL_AVAILABILITY_LABELS[availability]}</Text>
          </View>
          <Text style={styles.description}>
            {online
              ? `운반 콜을 대기하고 있어요 (반경 ${radiusKm}km)`
              : '콜대기를 켜면 운반 콜을 받을 수 있어요'}
          </Text>
        </View>
        <AppIcon
          name={online ? 'notifications' : 'lock'}
          size={32}
          color={online ? colors.primary : colors.textMuted}
          filled={online}
        />
      </View>

      {!online ? (
        <View style={styles.radiusSelector}>
          <Text style={styles.radiusLabel}>매칭 수신 반경 설정</Text>
          <View style={styles.radiusOptions}>
            {[30, 40, 50, 100].map((km) => (
              <AppButton
                key={km}
                label={`${km}km`}
                variant={radiusKm === km ? 'primary' : 'outline'}
                style={styles.radiusOptionBtn}
                onPress={() => setRadiusKm(km)}
              />
            ))}
          </View>
        </View>
      ) : null}

      <AppButton
        label={online ? '콜대기 끄기' : '콜대기 켜기'}
        variant={online ? 'outline' : 'primary'}
        onPress={toggle}
        loading={busy}
      />
    </Card>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  card: {
    borderColor: colors.border,
    borderWidth: 2,
    marginHorizontal: spacing.sm,
    padding: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.background,
  },
  cardOn: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: colors.primary,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  textBox: {
    flex: 1,
    paddingRight: theme.spacing.sm,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  statusDot: {
    backgroundColor: theme.colors.border,
    borderRadius: 999,
    height: 12,
    marginRight: theme.spacing.xs,
    width: 12,
  },
  statusDotOn: {
    backgroundColor: theme.colors.success,
  },
  status: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
  description: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
  radiusSelector: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  radiusLabel: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  radiusOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  radiusOptionBtn: {
    flexGrow: 1,
    flexBasis: '22%',
  },
});
