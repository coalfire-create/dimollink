import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { isItemDone, type RemoteSurvey, type RemoteSurveyItem } from '@dimol/shared';
import { AppButton, Card } from '../../components/ui';
import { Scan3DCaptureModal } from '../../components/Scan3DCaptureModal';
import { Scan3DProgressCard } from '../../components/Scan3DProgressCard';
import { useScan3D } from '../../lib/useScan3D';
import { ItemStatus } from './ItemStatus';
import { PhotoCaptureButton } from './PhotoCaptureButton';
import type { LocalPhoto } from './useRemoteSurvey';
import { theme } from '../../theme';

/** 외부 4면 사진 장수 — 앞·뒤·왼쪽·오른쪽. 체크리스트 최소 장수와 같다. */
const EXTERIOR_SIDES = 4;

/**
 * 건물 바깥 — 한 바퀴 영상(3D 스캔) 또는 4면 사진 중 하나.
 *
 * 영상을 먼저 권한다: 업체가 물량을 직접 잴 수 있어 방문에 가장 가깝다. 다만 복원이
 * 20~40분 걸리고 기기에 따라 실패할 수 있어 사진 4장 경로를 항상 같이 둔다.
 * 복원이 실패하면 스캔 연결을 끊어 "다 찍음"으로 남지 않게 한다.
 */
export function ExteriorCard({
  item,
  survey,
  busy,
  onPhotos,
  onScanJob,
}: {
  item: RemoteSurveyItem;
  survey: RemoteSurvey;
  busy: boolean;
  onPhotos: (photos: LocalPhoto[]) => void;
  onScanJob: (jobId: string | null) => void;
}) {
  const [scanOpen, setScanOpen] = useState(false);
  const scan = useScan3D();
  const photoCount = survey.items.EXTERIOR?.length ?? 0;

  // 복원 잡이 생기면 패키지에 붙이고, 실패하면 뗀다.
  const jobId = scan.job?.id;
  const jobFailed = scan.job?.status === 'FAILED';
  useEffect(() => {
    if (!jobId) return;
    if (jobFailed && survey.scanJobId === jobId) onScanJob(null);
    else if (!jobFailed && survey.scanJobId !== jobId) onScanJob(jobId);
    // onScanJob 은 매 렌더 새로 만들어진다 — 잡 상태가 바뀔 때만 반응한다.
  }, [jobId, jobFailed]);

  return (
    <Card>
      <ItemStatus title={item.title} done={isItemDone(survey, item)} required />
      <Text style={styles.instruction}>{item.instruction}</Text>

      {survey.scanJobId && !scan.job ? (
        <Text style={styles.note}>✓ 한 바퀴 영상을 보냈어요.</Text>
      ) : null}
      {scan.busy && !scan.job ? <Text style={styles.note}>영상을 올리는 중이에요…</Text> : null}
      {scan.job ? <Scan3DProgressCard job={scan.job} /> : null}
      {scan.error ? <Text style={styles.error}>{scan.error}</Text> : null}

      <View style={styles.actions}>
        <AppButton
          label={survey.scanJobId ? '영상 다시 찍기' : '한 바퀴 영상 찍기(추천)'}
          disabled={busy || scan.busy}
          onPress={() => setScanOpen(true)}
        />
        <Text style={styles.or}>또는</Text>
        <Text style={styles.note}>
          4면 사진 {photoCount}장 / {EXTERIOR_SIDES}장
        </Text>
        <PhotoCaptureButton
          label={photoCount > 0 ? '사진 더 찍기' : '4면 사진 찍기'}
          variant="outline"
          maxPhotos={EXTERIOR_SIDES}
          disabled={busy}
          onPhotos={onPhotos}
        />
      </View>

      <Scan3DCaptureModal
        visible={scanOpen}
        target="EXTERIOR"
        onClose={() => setScanOpen(false)}
        onComplete={(result) => {
          setScanOpen(false);
          void scan.start(result);
        }}
      />
    </Card>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  instruction: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: 28,
    marginBottom: spacing.sm,
  },
  note: {
    color: colors.textMuted,
    fontSize: font.body,
    marginBottom: spacing.xs,
  },
  error: {
    color: colors.error,
    fontSize: font.body,
    marginBottom: spacing.xs,
  },
  or: {
    color: colors.textMuted,
    fontSize: font.body,
    textAlign: 'center',
  },
  actions: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
