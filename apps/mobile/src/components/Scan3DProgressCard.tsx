import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  SCAN_3D_STAGE_LABELS,
  formatRemaining,
  scan3DRemainingSeconds,
  type Scan3DJob,
} from '@dimol/shared';
import { theme } from '../theme';

/**
 * 3D 복원 진행 카드.
 *
 * 복원은 20~40분 걸린다. 아무것도 안 보여주면 앱이 멈춘 것으로 오해하므로
 * **지금 무슨 단계인지**와 진행률을 계속 보여준다. 단계 문구·진행률은 전부
 * 공유 계약에서 가져온다([[site-scan-3d]]) — 화면이 직접 계산하지 않는다.
 */
export function Scan3DProgressCard({ job }: { job: Scan3DJob }) {
  if (job.status === 'FAILED') {
    return (
      <View style={[styles.card, styles.failed]}>
        <Text style={styles.title}>3D 복원에 실패했어요</Text>
        <Text style={styles.body}>{job.error ?? '다시 촬영해 주세요.'}</Text>
      </View>
    );
  }

  if (job.status === 'COMPLETED' && job.result) {
    const { grossVolumeM3, usable, reasons } = job.result;
    return (
      <View style={[styles.card, usable ? styles.done : styles.warn]}>
        <Text style={styles.title}>
          {usable ? '3D 복원 완료' : '3D 복원은 됐지만 크기를 확정하지 못했어요'}
        </Text>
        {usable ? (
          <Text style={styles.body}>실측 부피 약 {Math.round(grossVolumeM3)}㎥</Text>
        ) : (
          reasons.map((reason) => (
            <Text key={reason} style={styles.body}>
              • {reason}
            </Text>
          ))
        )}
      </View>
    );
  }

  const percent = Math.round(job.progress * 100);
  const stageLabel = job.stage ? SCAN_3D_STAGE_LABELS[job.stage] : '준비하는 중';
  // 진행률만 보여주면 20~40분 대기 중에 멈춘 것으로 오해한다 — 남은 시간을 함께 준다.
  const elapsedSeconds = Math.max(
    0,
    (Date.parse(job.updatedAt) - Date.parse(job.createdAt)) / 1000,
  );
  const remaining = formatRemaining(scan3DRemainingSeconds(job.progress, elapsedSeconds));

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.title}>{stageLabel}</Text>
        <Text style={styles.remaining}>{remaining}</Text>
      </View>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
      >
        <View style={[styles.fill, { width: `${Math.max(3, percent)}%` }]} />
      </View>
      <Text style={styles.body}>
        {percent}% · 앱을 닫아도 계속 진행됩니다. 끝나면 알려드릴게요.
      </Text>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  done: { borderColor: colors.primary },
  warn: { borderColor: colors.secondary },
  failed: { borderColor: colors.error },
  headRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: colors.text, flex: 1, fontSize: font.bodyLarge, fontWeight: '800' },
  remaining: { color: colors.primary, fontSize: font.body, fontWeight: '700' },
  body: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.xs },
  track: {
    backgroundColor: colors.border,
    borderRadius: 6,
    height: 12,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  fill: { backgroundColor: colors.primary, height: 12 },
});
