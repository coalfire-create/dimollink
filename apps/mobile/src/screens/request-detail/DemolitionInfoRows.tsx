import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  ASBESTOS_RISK_LABELS,
  BUILDING_TYPE_LABELS,
  DEMOLITION_TYPE_LABELS,
  asbestosRisk,
  isVisionMaterialCode,
  ledgerDisplayRows,
  visionMaterialLabel,
  type DemolitionRequest,
} from '@dimol/shared';
import { InfoRow } from '../../components/ui';
import { theme } from '../../theme';

/**
 * 철거 요청 상세 행 — 현장 조건 + 건축물대장 + 사진 분석 + 폐기물 내역.
 *
 * 업체가 현장에 나가기 전에 확인하는 값들이라, 접수 당시에 확보한 사실을 그대로 남긴다.
 * 특히 석면은 사전조사 의무가 걸리는 항목이라 눈에 띄게 따로 표시한다.
 */
export function DemolitionInfoRows({ request }: { request: DemolitionRequest }) {
  const details = request.demolitionDetails;
  const ledger = details?.buildingLedger;
  const risk = ledger ? asbestosRisk(ledger) : undefined;
  const vision = details?.dimolVisionAnalysis;

  return (
    <>
      <InfoRow label="현장 주소" value={request.siteAddress} />
      {details?.buildingType ? (
        <InfoRow
          label="건물 종류"
          value={BUILDING_TYPE_LABELS[details.buildingType] ?? details.buildingType}
        />
      ) : null}
      {details?.demolitionType ? (
        <InfoRow
          label="철거 종류"
          value={DEMOLITION_TYPE_LABELS[details.demolitionType] ?? details.demolitionType}
        />
      ) : null}
      {details?.spaceSize ? <InfoRow label="평수 / 면적" value={details.spaceSize} /> : null}
      {details?.floorCount ? <InfoRow label="층수" value={details.floorCount} /> : null}
      {details?.hasElevator !== undefined ? (
        <InfoRow label="엘리베이터" value={details.hasElevator ? '있음' : '없음'} />
      ) : null}
      {details?.hasVehicleAccess !== undefined ? (
        <InfoRow label="차량/사다리 진입" value={details.hasVehicleAccess ? '가능' : '불가'} />
      ) : null}
      {details?.desiredDate ? <InfoRow label="희망 철거일" value={details.desiredDate} /> : null}
      {details?.description ? <InfoRow label="상세 요구사항" value={details.description} /> : null}

      {ledgerDisplayRows(ledger).map((row) => (
        <InfoRow key={`ledger-${row.label}`} label={`대장 ${row.label}`} value={row.value} />
      ))}
      {risk === 'HIGH' || risk === 'POSSIBLE' ? (
        <InfoRow
          label="석면"
          value={`${ASBESTOS_RISK_LABELS[risk]} — 철거 전 석면 사전조사 필요`}
        />
      ) : null}

      {vision?.summary ? (
        <>
          <InfoRow label="현장 분석 요약" value={vision.summary} />
          {vision.hazards && vision.hazards.length > 0 ? (
            <InfoRow label="위험요소" value={vision.hazards.join(', ')} />
          ) : null}
          {vision.materials && vision.materials.length > 0 ? (
            <InfoRow
              label="감지된 소재"
              value={vision.materials
                .map((m) => (isVisionMaterialCode(m) ? visionMaterialLabel(m) : m))
                .join(', ')}
            />
          ) : null}
          {vision.confidence ? <InfoRow label="분석 정확도" value={vision.confidence} /> : null}
        </>
      ) : null}

      {request.wasteItems && request.wasteItems.length > 0 ? (
        <View style={styles.wasteBlock}>
          <Text style={styles.wasteTitle}>폐기물 상세 내역</Text>
          {request.wasteItems.map((item) => (
            <InfoRow
              key={item.material}
              label={visionMaterialLabel(item.material)}
              value={`${item.kg} kg`}
            />
          ))}
          <InfoRow label="총 예상 무게" value={`${request.wasteTons} 톤`} />
        </View>
      ) : null}
    </>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  wasteBlock: {
    marginTop: spacing.xs,
  },
  wasteTitle: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.xs / 2,
  },
});
