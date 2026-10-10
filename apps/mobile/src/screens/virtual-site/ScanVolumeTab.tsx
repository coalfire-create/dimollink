import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BUILDING_STRUCTURE_LABELS,
  resolveFloorArea,
  structureCodeOf,
  type Scan3DJob,
  type VolumeEstimate,
} from '@dimol/shared';
import { estimateVolume, getScanJob } from '../../api/client';
import { WasteBreakdownCard } from '../../components/demolition/WasteBreakdownCard';
import { Card, ErrorBanner, LoadingView, SectionTitle } from '../../components/ui';
import { theme } from '../../theme';
import { ScanResultCard } from './ScanResultCard';
import { useReviewSource } from './useReviewSource';

/**
 * 3D·물량 탭 — 실측(3D 스캔)과 추정(연면적 원단위)을 나란히 둔다.
 *
 * 물량 추정은 서버의 기존 추정기(`/estimation/volume`, 연면적 × 원단위 × 구조 보정)를 그대로
 * 부른다 — 이 화면에서 새 계수를 만들지 않는다. AI 소재 분석은 신청 때 저장된 디몰비전 결과를
 * 기존 물량 브리핑 카드로 보여준다.
 */
export function ScanVolumeTab({ requestId }: { requestId: string }) {
  const { request, survey, loading, error, reload } = useReviewSource(requestId);
  const [job, setJob] = useState<Scan3DJob | null>(null);
  const [jobLoaded, setJobLoaded] = useState(false);
  const [estimate, setEstimate] = useState<VolumeEstimate | null>(null);

  const scanJobId = survey?.scanJobId;
  const details = request?.demolitionDetails;
  const area = resolveFloorArea(details);
  const areaM2 = area?.m2;
  const structure = structureCodeOf(details?.buildingLedger);

  useEffect(() => {
    if (!scanJobId) return;
    // 복원 잡은 서버 메모리에 있어 재시작 후엔 없을 수 있다 — 실패는 "못 불러옴"으로 보여준다.
    getScanJob(scanJobId)
      .then(setJob)
      .catch(() => setJob(null))
      .finally(() => setJobLoaded(true));
  }, [scanJobId]);

  useEffect(() => {
    if (!areaM2) return;
    estimateVolume({ floorAreaM2: areaM2, structure })
      .then(setEstimate)
      .catch(() => setEstimate(null));
  }, [areaM2, structure]);

  if (loading) return <LoadingView />;
  if (!request) return <ErrorBanner message={error} onRetry={() => void reload()} />;

  return (
    <View>
      {scanJobId ? (
        jobLoaded ? (
          <ScanResultCard job={job} />
        ) : (
          <LoadingView />
        )
      ) : (
        <View>
          <SectionTitle>3D 스캔</SectionTitle>
          <Card>
            <Text style={styles.hint}>
              신청자가 3D 스캔을 보내지 않았어요. 외부 사진(사진 탭)과 연면적 추정으로 보세요.
            </Text>
          </Card>
        </View>
      )}

      <SectionTitle>예상 폐기물량(시스템 추정)</SectionTitle>
      <Card>
        {estimate ? (
          <>
            <Text style={styles.range}>
              {estimate.rangeMinTons.toLocaleString('ko-KR')} ~{' '}
              {estimate.rangeMaxTons.toLocaleString('ko-KR')}톤
            </Text>
            <Text style={styles.hint}>
              연면적 {estimate.floorAreaM2.toLocaleString('ko-KR')}㎡ ·{' '}
              {structure ? BUILDING_STRUCTURE_LABELS[structure] : '구조 모름(철근콘크리트 기준)'}
            </Text>
            <Text style={styles.disclaimer}>{estimate.disclaimer}</Text>
          </>
        ) : (
          <Text style={styles.hint}>
            {area
              ? '추정치를 불러오지 못했어요.'
              : '연면적 근거가 없어 추정할 수 없어요. 3D 스캔·방 사진으로 직접 보세요.'}
          </Text>
        )}
      </Card>

      <WasteBreakdownCard
        wasteItems={request.wasteItems}
        wasteTons={request.wasteTons}
        vision={details?.dimolVisionAnalysis}
      />
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  hint: { color: colors.textMuted, fontSize: font.body, lineHeight: 28 },
  range: { color: colors.primary, fontSize: font.title, fontWeight: '800' },
  disclaimer: { color: colors.textMuted, fontSize: font.caption, lineHeight: 26, marginTop: spacing.xs },
});
