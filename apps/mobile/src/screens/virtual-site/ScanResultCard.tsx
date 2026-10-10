import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SCAN_SCALE_SOURCE_LABELS, type Scan3DJob } from '@dimol/shared';
import { ApiError, getScanSceneUrl } from '../../api/client';
import { Scan3DViewerModal } from '../../components/Scan3DViewerModal';
import { AppButton, Card, ErrorBanner, InfoRow, SectionTitle } from '../../components/ui';
import { theme } from '../../theme';

/**
 * 3D 스캔 결과 — 외피 부피, 치수 기준(스케일 출처), 물량에 쓸 수 있는지와 못 쓰는 이유.
 *
 * "쓸 수 없음"도 숨기지 않는다. 나쁜 스캔의 부피는 통계 추정보다 나쁘다([[scan-volume]]) —
 * 업체가 그 숫자를 실측으로 믿으면 안 된다.
 */
export function ScanResultCard({ job }: { job: Scan3DJob | null }) {
  const [sceneUrl, setSceneUrl] = useState<string | undefined>();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = job?.result;
  const sceneKey = result?.artifacts.splatKey ?? result?.artifacts.meshKey;

  async function openViewer() {
    if (!sceneKey) return;
    setOpening(true);
    setError(null);
    try {
      setSceneUrl((await getScanSceneUrl(sceneKey)).viewUrl);
      setViewerOpen(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '3D 장면을 열지 못했습니다.');
    } finally {
      setOpening(false);
    }
  }

  return (
    <View>
      <SectionTitle>3D 스캔</SectionTitle>
      <Card>
        {!job ? (
          <Text style={styles.hint}>
            3D 결과를 불러오지 못했어요. 복원 서버가 다시 시작되면 결과가 사라질 수 있어요.
          </Text>
        ) : !result ? (
          <Text style={styles.hint}>
            {job.status === 'FAILED'
              ? `3D 복원에 실패했어요. ${job.error ?? ''}`
              : `3D 복원 중이에요(${Math.round(job.progress * 100)}%).`}
          </Text>
        ) : (
          <>
            <Text style={styles.volume}>
              외피 부피 {result.grossVolumeM3.toLocaleString('ko-KR')}㎥
            </Text>
            <InfoRow label="치수 기준" value={SCAN_SCALE_SOURCE_LABELS[result.scaleSource]} />
            <InfoRow label="물량에 쓰기" value={result.usable ? '가능' : '불가'} />
            {result.reasons.map((reason) => (
              <Text key={reason} style={styles.reason}>
                · {reason}
              </Text>
            ))}
            {sceneKey ? (
              <AppButton
                label="3D로 둘러보기"
                variant="outline"
                loading={opening}
                onPress={() => void openViewer()}
                style={styles.button}
              />
            ) : null}
          </>
        )}
        <ErrorBanner message={error} />
      </Card>
      <Scan3DViewerModal
        visible={viewerOpen}
        sceneUrl={sceneUrl}
        onClose={() => setViewerOpen(false)}
      />
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  hint: { color: colors.textMuted, fontSize: font.body, lineHeight: 28 },
  volume: { color: colors.primary, fontSize: font.title, fontWeight: '800', marginBottom: spacing.xs },
  reason: { color: colors.error, fontSize: font.body, lineHeight: 28 },
  button: { marginTop: spacing.sm },
});
