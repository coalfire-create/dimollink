import { findSalesProduct } from '@dimol/shared';
import { calculateSettlementDate } from '../settlement/settlement-date.js';
import type { SubscriptionStore } from '../subscriptions/store.js';
import type { PortOneClient } from '../payment/portone-client.js';
import type { ScheduledTask } from './index.js';
import type { AllbaroClient } from '../allbaro/client.js';
import { processRetryQueue, getDefaultRetryQueue } from '../allbaro/manifest-service.js';
import type { RetryQueueItem } from '../allbaro/retry-queue.js';
import type { RequestStore } from '../requests/store.js';

/**
 * 실제 주기 작업들.
 *
 * 두 작업의 성격이 다르다는 점이 설계를 가른다:
 * - 재시도는 **이미 실패한 것을 다시 보낼 뿐**이라 자동화해도 새로 생기는 위험이 없다.
 * - 정산은 **돈이 나간다.** 자동 송금은 잘못되면 되돌리기 어렵고, CLAUDE.md 도
 *   결제/정산은 샌드박스 검증 후 운영 전환하라고 못 박는다. 그래서 여기서는
 *   "오늘 정산해야 할 건"을 **찾아서 알리기만** 한다. 실제 지급은 운영자가 실행한다.
 */

/** 재시도 처리 주기. 올바로 장애는 보통 분 단위로 풀리므로 5분이면 충분하다. */
export const RETRY_INTERVAL_MS = 5 * 60 * 1000;

/** 정산 대상 점검 주기. 하루 한 번이면 되지만, 재시작이 잦아 1시간마다 본다. */
export const SETTLEMENT_INTERVAL_MS = 60 * 60 * 1000;

/** 정기결제 청구 주기. 결제일은 하루 단위라 1시간마다 보면 충분하다. */
export const SUBSCRIPTION_INTERVAL_MS = 60 * 60 * 1000;

export interface RetryTaskDeps {
  client: AllbaroClient;
  onExhausted?: (item: RetryQueueItem) => void;
}

/**
 * 올바로 재시도 큐 처리.
 *
 * 이게 없으면 발행 실패 건이 큐에 영원히 쌓인다 — 관리자가 매일 손으로 눌러야 하는데,
 * 안 누르면 법정 미신고다. 큐가 비어 있으면 올바로를 부르지 않는다(무의미한 호출 방지).
 */
export function createRetryTask(deps: RetryTaskDeps): ScheduledTask {
  return {
    name: 'allbaro-retry',
    intervalMs: RETRY_INTERVAL_MS,
    async run() {
      const queue = getDefaultRetryQueue();
      if (queue.due(Date.now()).length === 0) return;
      const summary = await processRetryQueue(deps.client, queue, {
        onExhausted: deps.onExhausted,
      });
      // 건수만 남긴다 — 큐 항목에는 사업자번호(PII)가 들어 있다.
      console.info(
        `[scheduler] 올바로 재시도 처리: 성공 ${summary.succeeded} · 재적재 ${summary.requeued} · 소진 ${summary.exhausted}`,
      );
    },
  };
}

export interface SubscriptionTaskDeps {
  subscriptions: SubscriptionStore;
  portone: PortOneClient;
  now?: () => Date;
}

/**
 * 월 정기결제 청구.
 *
 * 정산(사람이 실행)과 달리 **자동으로 결제한다.** 구독은 사용자가 이미 동의한 반복
 * 결제라 매달 사람이 눌러야 한다면 상품이 성립하지 않는다. 대신 금액은 서버 상품가로
 * 고정돼 있고(앱이 못 바꾼다), 실패는 상태로 남겨 다음 주기에 다시 시도한다.
 *
 * ⚠️ 멱등성: paymentId 를 `구독id-결제일` 로 만든다. 스케줄러가 겹쳐 돌거나 재시작해도
 * 같은 달에 두 번 청구되지 않는다(PG 가 같은 paymentId 를 거부한다).
 */
export function createSubscriptionBillingTask(deps: SubscriptionTaskDeps): ScheduledTask {
  const now = deps.now ?? (() => new Date());
  return {
    name: 'subscription-billing',
    intervalMs: SUBSCRIPTION_INTERVAL_MS,
    async run() {
      const today = kstDate(now());
      const due = await deps.subscriptions.listDue(today);
      for (const sub of due) {
        const product = findSalesProduct(sub.productId);
        if (!product || product.billingType !== 'MONTHLY_SUBSCRIPTION') continue;
        try {
          const result = await deps.portone.payWithBillingKey({
            paymentId: `${sub.id}-${sub.nextBillingDate}`,
            billingKey: sub.billingKey,
            orderName: product.name,
            amount: product.price,
            customerId: sub.userId,
          });
          if (result.paid) {
            await deps.subscriptions.markCharged(sub.id);
          } else {
            await deps.subscriptions.markFailed(sub.id, 'NOT_PAID');
          }
        } catch (err) {
          // 사유는 코드/요약만 — 카드 정보가 섞이면 안 된다.
          const reason = err instanceof Error ? err.message.slice(0, 120) : 'BILLING_ERROR';
          await deps.subscriptions.markFailed(sub.id, reason);
          console.warn(`[scheduler] 정기결제 실패 subscription=${sub.id}`);
        }
      }
      if (due.length > 0) {
        console.info(`[scheduler] 정기결제 처리 ${due.length}건`);
      }
    },
  };
}

/** 'YYYY-MM-DD' (KST 기준). 정산일 계산이 KST 날짜를 쓰므로 여기서도 맞춘다. */
export function kstDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface SettlementTaskDeps {
  requestStore: RequestStore;
  holidays?: ReadonlySet<string>;
  now?: () => Date;
  /** 정산 대상을 알린다. 기본은 로그 — 실제 지급은 운영자가 실행한다. */
  notify?: (due: DueSettlement[]) => void;
}

export interface DueSettlement {
  matchRequestId: string;
  completedDate: string;
  settlementDate: string;
  agreedFee: number;
}

/**
 * 정산일이 된 처리완료(COMPLETED) 건을 찾는다.
 *
 * ⚠️ **지급을 실행하지 않는다.** 돈이 나가는 동작이라 사람의 실행을 남겨둔다
 * (CLAUDE.md: PG 는 테스트 모드 검증 후 운영 전환). 자동 송금으로 바꾸려면
 * 포트원 가맹·지급대행 계약과 실거래 대사 검증이 먼저다.
 */
export function createSettlementTask(deps: SettlementTaskDeps): ScheduledTask {
  const now = deps.now ?? (() => new Date());
  const notify =
    deps.notify ??
    ((due: DueSettlement[]) => {
      // 금액·건수만 남긴다. 사업자번호·계좌는 찍지 않는다.
      console.warn(
        `[scheduler] 정산 대상 ${due.length}건 (실행 대기) — ${due.map((d) => d.matchRequestId).join(', ')}`,
      );
    });

  return {
    name: 'settlement-due',
    intervalMs: SETTLEMENT_INTERVAL_MS,
    async run() {
      const today = kstDate(now());
      const completed = await deps.requestStore.list({ status: 'COMPLETED' });
      const due: DueSettlement[] = [];
      for (const request of completed) {
        const agreedFee = request.agreedFee ?? 0;
        // 합의 금액이 없으면 정산할 것이 없다 — 알려봐야 운영자가 할 일이 없다.
        if (agreedFee <= 0) continue;
        const completedDate = kstDate(new Date(request.updatedAt));
        const settlementDate = calculateSettlementDate(completedDate, deps.holidays);
        if (settlementDate <= today) {
          due.push({ matchRequestId: request.id, completedDate, settlementDate, agreedFee });
        }
      }
      if (due.length > 0) notify(due);
    },
  };
}

/** 백업 점검 주기. 하루 한 번 돌면 되지만, 재배포가 잦아 1시간마다 확인한다. */
export const BACKUP_INTERVAL_MS = 60 * 60 * 1000;

export interface BackupTaskDeps {
  /** 백업 1회 실행. 성공 시 만들어진 키를 돌려준다. */
  run: () => Promise<{ key: string; rowCount: number; bytes: number }>;
  /** 이미 있는 백업 키 목록 — "오늘 것이 있는가"를 여기서 판단한다. */
  listKeys: () => Promise<string[]>;
  /** 키에서 KST 날짜(YYYYMMDD)를 뽑는 함수. */
  dateOf: (key: string) => string | undefined;
  /** 이 시각(KST) 이후에 그날 백업을 뜬다. */
  hourKst: number;
  now?: () => Date;
}

/**
 * 하루 한 번 DB 백업.
 *
 * "오늘 이미 떴는가"를 **버킷 목록으로** 판단한다. 별도 상태 테이블을 두면 그 상태와
 * 실제 파일이 어긋날 수 있고(파일은 지워졌는데 "떴음"으로 남는 경우), 무엇보다
 * 백업이 있는지 확인하는 유일하게 믿을 만한 근거는 파일 그 자체다.
 *
 * 스케줄러는 인스턴스 하나 전제라 잠금이 없다(index.ts 주석 참조). 두 대로 늘리면
 * 같은 날 두 번 뜰 수 있는데, 백업이 하루에 두 개 생기는 것은 손해가 아니다.
 */
export function createBackupTask(deps: BackupTaskDeps): ScheduledTask {
  const now = deps.now ?? (() => new Date());
  return {
    name: 'db-backup',
    intervalMs: BACKUP_INTERVAL_MS,
    async run() {
      const kst = new Date(now().getTime() + 9 * 60 * 60 * 1000);
      if (kst.getUTCHours() < deps.hourKst) return; // 아직 백업 시각 전.
      const today = kstDate(now()).replaceAll('-', '');
      const keys = await deps.listKeys();
      if (keys.some((k) => deps.dateOf(k) === today)) return; // 오늘 것이 이미 있다.

      const result = await deps.run();
      // 내용은 남기지 않는다 — 덤프에는 PII 가 들어 있다. 건수·크기만.
      console.info(
        `[scheduler] DB 백업 완료 ${result.rowCount}행 ${Math.round(result.bytes / 1024)}KB`,
      );
    },
  };
}
