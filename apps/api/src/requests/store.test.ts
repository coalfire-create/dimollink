import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REQUEST_STATUS_TRANSITIONS, type MatchStatus } from '@dimol/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServiceRequest } from '@dimol/shared';
import { JsonCollectionFile } from '../lib/json-collection.js';
import { buildSitePhotoKey } from '../storage/site-photo.js';
import { RequestStore, RequestValidationError, type CreateRequestInput } from './store.js';

function requestsFile(dir: string): JsonCollectionFile<ServiceRequest> {
  return new JsonCollectionFile<ServiceRequest>(dir, 'requests.json');
}

const demolition: CreateRequestInput = {
  kind: 'DEMOLITION',
  requesterId: 'discharger-1',
  region: '양평',
  wasteCategory: 'CONSTRUCTION',
  wasteTons: 7,
  allbaroRequested: true,
  siteAddress: '경기 양평군 양평읍 현장 1',
};

const transport: CreateRequestInput = {
  kind: 'TRANSPORT',
  requesterId: 'discharger-1',
  region: '양평',
  wasteCategory: 'CONSTRUCTION',
  wasteTons: 5,
  allbaroRequested: false,
  loadAddress: '경기 양평군 상차지',
  unloadAddress: '경기 양평군 하차지',
};

const reservation: CreateRequestInput = {
  kind: 'DISPOSAL_RESERVATION',
  requesterId: 'discharger-2',
  region: '양평',
  wasteCategory: 'CONSTRUCTION',
  wasteTons: 6,
  allbaroRequested: true,
  visitAt: '2026-07-10T10:00:00+09:00',
};

describe('RequestStore.create — 3종 요청', () => {
  it('철거요청: 현장 주소 필수', async () => {
    const store = new RequestStore();
    const r = await store.create(demolition);
    expect(r.kind).toBe('DEMOLITION');
    expect(r.status).toBe('REQUESTED');
    await expect(store.create({ ...demolition, siteAddress: ' ' })).rejects.toThrow(
      RequestValidationError,
    );
  });

  it('운반요청: 상차지/하차지 필수', async () => {
    const store = new RequestStore();
    expect((await store.create(transport)).kind).toBe('TRANSPORT');
    await expect(store.create({ ...transport, unloadAddress: undefined })).rejects.toThrow(
      RequestValidationError,
    );
  });

  it('처리장예약: 방문 일시(ISO 8601) 필수', async () => {
    const store = new RequestStore();
    expect((await store.create(reservation)).kind).toBe('DISPOSAL_RESERVATION');
    await expect(store.create({ ...reservation, visitAt: '다음주쯤' })).rejects.toThrow(
      RequestValidationError,
    );
  });

  it('전국 어느 지역이든 접수 가능(전국구), 건설폐기물 외 카테고리만 거부', async () => {
    const store = new RequestStore();
    expect((await store.create({ ...demolition, region: '서울' })).region).toBe('서울');
    await expect(store.create({ ...demolition, wasteCategory: 'HOUSEHOLD' })).rejects.toThrow(
      RequestValidationError,
    );
  });

  it('현장 사진 키 연결 + 형식 검증', async () => {
    const store = new RequestStore();
    const key = buildSitePhotoKey('DEMOLITION_REQUEST', 'image/jpeg');
    expect((await store.create({ ...demolition, sitePhotoKeys: [key] })).sitePhotoKeys).toEqual([
      key,
    ]);
    await expect(
      store.create({ ...demolition, sitePhotoKeys: ['https://evil.example/x.jpg'] }),
    ).rejects.toThrow(RequestValidationError);
  });
});

describe('RequestStore.create — 소재별 kg 항목(wasteItems)', () => {
  it('소재별 항목으로 접수하고 wasteTons 를 kg 합계에서 자동 산출', async () => {
    const store = new RequestStore();
    const r = await store.create({
      ...transport,
      wasteTons: undefined,
      wasteItems: [
        { material: 'REINFORCED_CONCRETE', kg: 4000 },
        { material: 'WOOD', kg: 1500 },
      ],
    });
    expect(r.wasteItems).toHaveLength(2);
    expect(r.wasteTons).toBe(5.5); // (4000 + 1500) / 1000
  });

  it('항목이 비었거나 소재/kg 가 유효하지 않으면 거부', async () => {
    const store = new RequestStore();
    await expect(
      store.create({ ...transport, wasteTons: undefined, wasteItems: [] }),
    ).rejects.toThrow(RequestValidationError);
    await expect(
      store.create({
        ...transport,
        wasteTons: undefined,
        wasteItems: [{ material: 'NOT_A_CODE', kg: 100 } as never],
      }),
    ).rejects.toThrow(RequestValidationError);
    await expect(
      store.create({
        ...transport,
        wasteTons: undefined,
        wasteItems: [{ material: 'WOOD', kg: 0 } as never],
      }),
    ).rejects.toThrow(RequestValidationError);
  });

  it('레거시 wasteTons 만 오면 혼합폐기물 1건으로 하위호환 환산', async () => {
    const store = new RequestStore();
    const r = await store.create({ ...transport, wasteItems: undefined, wasteTons: 3 });
    expect(r.wasteTons).toBe(3);
    expect(r.wasteItems).toEqual([{ material: 'MIXED_WASTE', kg: 3000 }]);
  });

  it('wasteItems·wasteTons 둘 다 없으면 거부', async () => {
    const store = new RequestStore();
    await expect(
      store.create({ ...transport, wasteItems: undefined, wasteTons: undefined }),
    ).rejects.toThrow(RequestValidationError);
  });
});

describe('RequestStore.create — linkedRequestId(예약↔운반 세트)', () => {
  it('연결 요청 id 를 저장하고, 미지정이면 필드가 없다', async () => {
    const store = new RequestStore();
    const reservation = await store.create(demolition);
    const linked = await store.create({ ...transport, linkedRequestId: reservation.id });
    expect(linked.linkedRequestId).toBe(reservation.id);
    expect((await store.create(transport)).linkedRequestId).toBeUndefined();
  });
});

describe('RequestStore.changeStatus — 상태 전이', () => {
  /** REQUESTED 에서 목표 상태까지 정방향 전이로 이동시킨 요청 id. */
  async function createAt(store: RequestStore, status: MatchStatus): Promise<string> {
    const r = await store.create(demolition);
    const path: MatchStatus[] = ['MATCHED', 'PAID', 'IN_PROGRESS', 'COMPLETED', 'SETTLED'];
    for (const next of path) {
      if ((await store.get(r.id))!.status === status) break;
      await store.changeStatus(r.id, next, { matchedProviderId: 'provider-1' });
    }
    return r.id;
  }

  it('대기중 → 매칭완료 (업체 id 기록)', async () => {
    const store = new RequestStore();
    const r = await store.create(demolition);
    const updated = await store.changeStatus(r.id, 'MATCHED', { matchedProviderId: 'provider-9' });
    expect(updated.status).toBe('MATCHED');
    expect(updated.matchedProviderId).toBe('provider-9');
  });

  it('매칭완료 처리에 matchedProviderId 누락 시 거부', async () => {
    const store = new RequestStore();
    const r = await store.create(demolition);
    await expect(store.changeStatus(r.id, 'MATCHED')).rejects.toThrow(RequestValidationError);
  });

  it('대기중/매칭완료/결제완료에서 취소 가능, 사유 기록', async () => {
    const store = new RequestStore();
    for (const status of ['REQUESTED', 'MATCHED', 'PAID'] as const) {
      const id = await createAt(store, status);
      const cancelled = await store.changeStatus(id, 'CANCELLED', { cancelReason: '일정 변경' });
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.cancelReason).toBe('일정 변경');
    }
  });

  it('작업 시작(진행중) 후에는 취소 불가 — 취소 정책', async () => {
    const store = new RequestStore();
    const id = await createAt(store, 'IN_PROGRESS');
    expect((await store.get(id))!.status).toBe('IN_PROGRESS');
    await expect(store.changeStatus(id, 'CANCELLED')).rejects.toThrow(RequestValidationError);
  });

  it('건너뛰기 전이 거부 (대기중 → 진행중 등)', async () => {
    const store = new RequestStore();
    const r = await store.create(demolition);
    await expect(store.changeStatus(r.id, 'IN_PROGRESS')).rejects.toThrow(RequestValidationError);
    await expect(store.changeStatus(r.id, 'SETTLED')).rejects.toThrow(RequestValidationError);
  });

  it('전이 규칙 표의 모든 상태가 정의돼 있다', () => {
    // 상태가 추가되면 전이 표도 함께 갱신되어야 한다는 안전망.
    const statuses = Object.keys(REQUEST_STATUS_TRANSITIONS);
    expect(statuses.sort()).toEqual(
      ['REQUESTED', 'MATCHED', 'PAID', 'IN_PROGRESS', 'COMPLETED', 'SETTLED', 'CANCELLED'].sort(),
    );
  });
});

describe('RequestStore.list — 목록/필터', () => {
  it('요청자/종류/상태 필터, 최신순 정렬', async () => {
    const store = new RequestStore();
    await store.create(demolition);
    await store.create(transport);
    const r3 = await store.create(reservation);
    await store.changeStatus(r3.id, 'MATCHED', { matchedProviderId: 'p-1' });

    expect(await store.list()).toHaveLength(3);
    expect(await store.list({ requesterId: 'discharger-1' })).toHaveLength(2);
    expect(await store.list({ kind: 'TRANSPORT' })).toHaveLength(1);
    expect(await store.list({ status: 'MATCHED' })).toHaveLength(1);
    const created = (await store.list()).map((r) => r.createdAt);
    expect([...created].sort().reverse()).toEqual(created);
  });
});

describe('JSON 파일 영속화 — 재시작 시 데이터 유지', () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('저장 후 새 스토어에서 그대로 로드된다', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dimol-requests-'));
    const persistence = requestsFile(dir);

    const store1 = new RequestStore(persistence);
    const r = await store1.create(demolition);
    await store1.changeStatus(r.id, 'MATCHED', { matchedProviderId: 'provider-1' });

    const store2 = new RequestStore(requestsFile(dir));
    const loaded = await store2.get(r.id);
    expect(loaded?.status).toBe('MATCHED');
    expect(loaded?.matchedProviderId).toBe('provider-1');
    expect(await store2.list()).toHaveLength(1);
  });

  it('파일이 없으면 빈 상태로 시작한다', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dimol-requests-'));
    expect(await new RequestStore(requestsFile(dir)).list()).toEqual([]);
  });
});
