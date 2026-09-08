import React, { useCallback } from 'react';
import { Text, View } from 'react-native';
import { REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS, type ProviderPricing, type ServiceRequest } from '@dimol/shared';
import {
  adminListPricing,
  adminListRequests,
  adminQuotesSummary,
  adminWasteMaterials,
  type AdminQuoteSummaryRow,
  type AdminWasteMaterialRow,
} from '../../api/client';
import { Card, SectionTitle } from '../../components/ui';
import { Empty, adminStyles as s, useAdminList } from './shared';
import type { AdminTabProps } from './shared';

/** 읽기 전용 현황 — 물량·견적·단가·요청. 여기서는 아무것도 바꾸지 않는다. */
export function StatsTab({ token, onError }: AdminTabProps) {
  const loadMaterials = useCallback(() => adminWasteMaterials(token), [token]);
  const loadQuotes = useCallback(() => adminQuotesSummary(token), [token]);
  const loadPricing = useCallback(() => adminListPricing(token), [token]);
  const loadRequests = useCallback(() => adminListRequests(token), [token]);

  const materials = useAdminList<AdminWasteMaterialRow>(loadMaterials, onError, '소재 현황 조회 실패');
  const quotes = useAdminList<AdminQuoteSummaryRow>(loadQuotes, onError, '견적 현황 조회 실패');
  const pricing = useAdminList<ProviderPricing>(loadPricing, onError, '단가 현황 조회 실패');
  const requests = useAdminList<ServiceRequest>(loadRequests, onError, '요청 현황 조회 실패');

  return (
    <>
      <SectionTitle>소재별 입력 현황</SectionTitle>
      <Card>
        {materials.items.length === 0 ? (
          <Empty>집계된 소재가 없어요.</Empty>
        ) : (
          materials.items.map((m) => (
            <View key={m.material} style={s.row}>
              <Text style={s.rowLabel} numberOfLines={1}>
                {m.label}
              </Text>
              <Text style={s.rowValue}>
                {Math.round(m.totalKg / 1000).toLocaleString('ko-KR')}톤 · {m.itemCount}건
              </Text>
            </View>
          ))
        )}
      </Card>

      <SectionTitle>견적 제출 현황</SectionTitle>
      <Card>
        {quotes.items.length === 0 ? (
          <Empty>제출된 견적이 없어요.</Empty>
        ) : (
          quotes.items.slice(0, 20).map((q) => (
            <View key={q.requestId} style={s.row}>
              <Text style={s.rowLabel} numberOfLines={1}>
                {q.requestId.slice(0, 8)}
              </Text>
              <Text style={s.rowValue}>{q.quoteCount}건</Text>
            </View>
          ))
        )}
      </Card>

      <SectionTitle>업체 단가 설정</SectionTitle>
      <Card>
        {pricing.items.length === 0 ? (
          <Empty>등록된 단가가 없어요.</Empty>
        ) : (
          pricing.items.slice(0, 20).map((p) => (
            <View key={p.userId} style={s.row}>
              <Text style={s.rowLabel} numberOfLines={1}>
                {p.userId.slice(0, 8)}
              </Text>
              <Text style={s.rowValue}>{p.unitPrice.toLocaleString('ko-KR')}원</Text>
            </View>
          ))
        )}
      </Card>

      <SectionTitle>전체 요청 ({requests.items.length})</SectionTitle>
      <Card>
        {requests.items.slice(0, 30).map((r) => (
          <View key={r.id} style={s.row}>
            <Text style={s.rowLabel} numberOfLines={1}>
              {REQUEST_KIND_LABELS[r.kind]} · {r.region}
            </Text>
            <Text style={s.rowValue}>{REQUEST_STATUS_LABELS[r.status]}</Text>
          </View>
        ))}
      </Card>
    </>
  );
}
