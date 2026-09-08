import { afterEach, describe, expect, it, vi } from 'vitest';
import { startScheduler, type ScheduledTask } from './index.js';
import { createSettlementTask, kstDate } from './tasks.js';
import { RequestStore } from '../requests/store.js';

/**
 * 스케줄러 — 이게 없어서 재시도 큐와 정산이 **아무도 부르지 않는 코드**로 남아 있었다.
 * 실패가 조용히 반복되거나(예외로 프로세스가 죽음), 느린 작업이 중첩돼 같은 건을
 * 두 번 처리하는 것이 이 계층에서 나오는 사고라, 그 둘을 못 박는다.
 */

afterEach(() => {
  vi.useRealTimers();
});

function task(over: Partial<ScheduledTask> & { run: ScheduledTask['run'] }): ScheduledTask {
  return { name: 't', intervalMs: 1000, ...over };
}

describe('startScheduler', () => {
  it('주기마다 실행한다', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue(undefined);
    const handle = startScheduler([task({ run })]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(3);
    handle.stop();
  });

  it('실행이 실패해도 다음 주기가 계속 돈다 — 여기서 던지면 프로세스가 죽는다', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockRejectedValue(new Error('올바로 장애'));
    const handle = startScheduler([task({ run })]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(3);
    handle.stop();
  });

  it('이전 실행이 안 끝났으면 건너뛴다 — 중첩되면 같은 건을 두 번 발행한다', async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const run = vi.fn(() => new Promise<void>((r) => (release = r)));
    const handle = startScheduler([task({ run })]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(1);
    release?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    handle.stop();
  });

  it('stop 하면 더 이상 돌지 않는다', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue(undefined);
    const handle = startScheduler([task({ run })]);
    await vi.advanceTimersByTimeAsync(1000);
    handle.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('createSettlementTask — 정산일이 된 건 찾기', () => {
  async function completedRequest(store: RequestStore, agreedFee: number | undefined) {
    const created = await store.create({
      kind: 'TRANSPORT',
      requesterId: 'u1',
      region: '양평',
      wasteCategory: 'CONSTRUCTION',
      wasteTons: 5,
      loadAddress: 'a',
      unloadAddress: 'b',
    } as never);
    // 합의 금액은 매칭 확정 시점에 정해진다(store 가 그때만 받는다).
    await store.changeStatus(created.id, 'MATCHED', { matchedProviderId: 'p1', agreedFee });
    await store.changeStatus(created.id, 'PAID');
    await store.changeStatus(created.id, 'IN_PROGRESS');
    const done = await store.changeStatus(created.id, 'COMPLETED');
    return done.id;
  }

  it('정산일이 지난 건을 알린다', async () => {
    const store = new RequestStore();
    const id = await completedRequest(store, 500_000);
    const notify = vi.fn();
    // 완료가 오래 전이었다고 보면 정산일은 이미 지났다.
    const task = createSettlementTask({
      requestStore: store,
      notify,
      now: () => new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    });
    await task.run();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0][0].matchRequestId).toBe(id);
  });

  it('합의 금액이 없으면 알리지 않는다 — 운영자가 할 일이 없다', async () => {
    const store = new RequestStore();
    await completedRequest(store, undefined);
    const notify = vi.fn();
    await createSettlementTask({
      requestStore: store,
      notify,
      now: () => new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    }).run();
    expect(notify).not.toHaveBeenCalled();
  });

  it('정산일 전이면 알리지 않는다', async () => {
    const store = new RequestStore();
    await completedRequest(store, 500_000);
    const notify = vi.fn();
    // 완료 직후 — D+1 영업일이 아직 안 왔다.
    await createSettlementTask({ requestStore: store, notify }).run();
    expect(notify).not.toHaveBeenCalled();
  });

  it('지급을 실행하지 않는다 — 돈이 나가는 동작은 사람이 실행한다', async () => {
    const store = new RequestStore();
    await completedRequest(store, 500_000);
    const notify = vi.fn();
    await createSettlementTask({
      requestStore: store,
      notify,
      now: () => new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    }).run();
    // 상태가 SETTLED 로 넘어가면 안 된다(지급이 일어났다는 뜻이 된다).
    const all = await store.list({ status: 'SETTLED' });
    expect(all).toHaveLength(0);
  });
});

describe('kstDate', () => {
  it('UTC 자정 직후도 KST 로는 다음 날이다', () => {
    expect(kstDate(new Date('2026-09-07T16:00:00Z'))).toBe('2026-09-08');
  });
});
