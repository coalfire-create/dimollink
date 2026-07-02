import { randomUUID } from 'node:crypto';
import type { AppNotification, MatchStatus, ServiceRequest } from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';
import type { NotificationProvider } from './provider.js';

/**
 * 매칭 단계별 알림 서비스 (로드맵 Phase 4).
 * 요청 상태 전이 리스너에서 호출돼 배출자/매칭 업체에게 단계별 한글 메시지를 만들어
 * 발송(어댑터)하고 인앱 알림함용으로 기록한다.
 */

/** 상태별 메시지 템플릿. UI 직접 노출 — 고령 사용자 기준으로 짧고 명확하게. */
const TEMPLATES: Partial<Record<MatchStatus, { requester?: string; provider?: string }>> = {
  MATCHED: {
    requester: '업체 매칭이 확정되었습니다. 결제를 진행해 주세요.',
    provider: '새 작업이 매칭되었습니다. 내용을 확인해 주세요.',
  },
  PAID: {
    requester: '결제가 완료되었습니다. 작업 일정이 곧 안내됩니다.',
    provider: '결제가 확인되었습니다. 작업을 준비해 주세요.',
  },
  IN_PROGRESS: {
    requester: '작업이 시작되었습니다.',
    provider: '작업 시작이 기록되었습니다.',
  },
  COMPLETED: {
    requester: '처리가 완료되었습니다. 업체 평가를 남겨 주세요.',
    provider: '처리 완료가 접수되었습니다. 정산은 다음 영업일에 진행됩니다.',
  },
  SETTLED: {
    provider: '정산이 완료되었습니다. 입금 내역을 확인해 주세요.',
  },
  CANCELLED: {
    requester: '요청이 취소되었습니다.',
    provider: '매칭된 작업이 취소되었습니다.',
  },
};

export class NotificationService {
  private readonly notifications = new Map<string, AppNotification>();

  constructor(
    private readonly provider: NotificationProvider,
    private readonly persistence?: CollectionPersistence<AppNotification>,
  ) {
    for (const n of persistence?.load() ?? []) this.notifications.set(n.id, n);
  }

  /**
   * 상태 전이 알림. RequestStore 리스너로 연결된다.
   * 발송 실패는 삼킨다 — 알림 때문에 상태 전이가 실패하면 안 된다.
   */
  notifyStatusChange(request: ServiceRequest): AppNotification[] {
    const template = TEMPLATES[request.status];
    if (!template) return [];

    const targets: Array<{ userId: string; message: string }> = [];
    if (template.requester) {
      targets.push({ userId: request.requesterId, message: template.requester });
    }
    if (template.provider && request.matchedProviderId) {
      targets.push({ userId: request.matchedProviderId, message: template.provider });
    }

    const created = targets.map<AppNotification>(({ userId, message }) => ({
      id: randomUUID(),
      userId,
      requestId: request.id,
      status: request.status,
      message,
      createdAt: new Date().toISOString(),
    }));

    for (const notification of created) {
      this.notifications.set(notification.id, notification);
      try {
        this.provider.send(notification);
      } catch {
        // 발송 실패해도 인앱 알림함 기록은 남는다. provider 교체 시 재시도 정책 추가.
      }
    }
    if (created.length > 0) this.persistence?.save([...this.notifications.values()]);
    return created;
  }

  /** 알림함 목록 (최신순). */
  list(filter: { userId?: string; requestId?: string } = {}): AppNotification[] {
    return [...this.notifications.values()]
      .filter(
        (n) =>
          (filter.userId === undefined || n.userId === filter.userId) &&
          (filter.requestId === undefined || n.requestId === filter.requestId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
