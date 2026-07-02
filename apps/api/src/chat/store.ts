import { randomUUID } from 'node:crypto';
import { CHAT_MESSAGE_MAX_LENGTH, type ChatMessage } from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';
import type { RequestStore } from '../requests/store.js';

/**
 * 인앱 채팅 저장소 (로드맵 Phase 4).
 * 매칭 확정된 요청의 당사자(배출자 ↔ 매칭 업체)만 주고받을 수 있다.
 * 취소/정산 완료 후에도 조회는 가능 (분쟁 대응 기록). 메시지 내용은 로그에 남기지 않는다.
 */

export class ChatValidationError extends Error {}

export class ChatStore {
  private readonly messages = new Map<string, ChatMessage>();
  private lastCreatedAt = '';

  constructor(
    private readonly requestStore: RequestStore,
    private readonly persistence?: CollectionPersistence<ChatMessage>,
  ) {
    for (const message of persistence?.load() ?? []) this.messages.set(message.id, message);
  }

  sendMessage(requestId: string, senderId: string, content: unknown): ChatMessage {
    const request = this.requestStore.get(requestId);
    if (!request) throw new ChatValidationError('요청을 찾을 수 없습니다.');
    if (!request.matchedProviderId) {
      throw new ChatValidationError('업체 매칭이 확정된 후에 채팅할 수 있습니다.');
    }
    if (senderId !== request.requesterId && senderId !== request.matchedProviderId) {
      throw new ChatValidationError('요청 당사자만 채팅할 수 있습니다.');
    }
    if (request.status === 'CANCELLED') {
      throw new ChatValidationError('취소된 요청에는 메시지를 보낼 수 없습니다.');
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new ChatValidationError('메시지 내용이 필요합니다.');
    }
    const trimmed = content.trim();
    if (trimmed.length > CHAT_MESSAGE_MAX_LENGTH) {
      throw new ChatValidationError(
        `메시지는 최대 ${CHAT_MESSAGE_MAX_LENGTH}자까지 보낼 수 있습니다.`,
      );
    }

    // createdAt 을 단조 증가로 보장한다 — 같은 밀리초에 연속 발신돼도
    // since 폴링(> 비교)과 대화 정렬이 안정적으로 동작해야 한다.
    let createdAt = new Date().toISOString();
    if (createdAt <= this.lastCreatedAt) {
      createdAt = new Date(Date.parse(this.lastCreatedAt) + 1).toISOString();
    }
    this.lastCreatedAt = createdAt;

    const message: ChatMessage = {
      id: randomUUID(),
      requestId,
      senderId,
      content: trimmed,
      createdAt,
    };
    this.messages.set(message.id, message);
    this.persistence?.save([...this.messages.values()]);
    return message;
  }

  /**
   * 대화 내역 (오래된 순 — 대화 흐름 순서).
   * 조회자도 당사자여야 한다. since(ISO) 이후 메시지만 — 폴링용.
   */
  listMessages(requestId: string, viewerId: string, since?: string): ChatMessage[] {
    const request = this.requestStore.get(requestId);
    if (!request) throw new ChatValidationError('요청을 찾을 수 없습니다.');
    if (viewerId !== request.requesterId && viewerId !== request.matchedProviderId) {
      throw new ChatValidationError('요청 당사자만 대화를 볼 수 있습니다.');
    }
    return [...this.messages.values()]
      .filter((m) => m.requestId === requestId && (since === undefined || m.createdAt > since))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
