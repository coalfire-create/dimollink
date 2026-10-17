import React from 'react';
import type { ServiceRequest } from '@dimol/shared';
import { Card, InfoRow, SectionTitle } from '../../components/ui';
import { DemolitionInfoRows } from './DemolitionInfoRows';
import { SitePhotoStrip } from './SitePhotoStrip';

/**
 * 요청 정보 카드 — 종류와 무관한 공통 행 + 종류별 행.
 *
 * 종류별 상세가 길어지는 건 철거뿐이라(대장·현장 분석·폐기물 내역) 그쪽만 따로 떼어 뒀다.
 * 운반·처리장 예약은 여기서 두세 줄로 끝난다.
 */
export function RequestInfoCard({
  request,
  photoUrls,
}: {
  request: ServiceRequest;
  photoUrls: string[];
}) {
  return (
    <>
      <SectionTitle>요청 정보</SectionTitle>
      <Card>
        <InfoRow label="지역" value={request.region} />
        {request.kind !== 'DEMOLITION' ? (
          <InfoRow label="예상 무게" value={`${request.wasteTons}톤`} />
        ) : null}
        {/* 올바로 신고를 신청한 건은 위 [[AllbaroStatusCard]] 가 따로 설명한다. */}
        {!request.allbaroRequested ? <InfoRow label="폐기물 확인" value="간이 확인서" /> : null}

        {request.kind === 'DEMOLITION' ? <DemolitionInfoRows request={request} /> : null}

        {request.kind === 'TRANSPORT' ? (
          <>
            <InfoRow label="상차지" value={request.loadAddress} />
            <InfoRow label="하차지" value={request.unloadAddress} />
          </>
        ) : null}

        {request.kind === 'DISPOSAL_RESERVATION' ? (
          <InfoRow
            label="방문 일시"
            value={new Date(request.visitAt).toLocaleString('ko-KR', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          />
        ) : null}

        <InfoRow label="현장 사진" value={`${request.sitePhotoKeys.length}장`} />
        <SitePhotoStrip urls={photoUrls} />
        <InfoRow label="접수일" value={new Date(request.createdAt).toLocaleDateString('ko-KR')} />
      </Card>
    </>
  );
}
