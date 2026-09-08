import { randomUUID } from 'node:crypto';
import { CHAT_MESSAGE_MAX_LENGTH, type ChatMessage } from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';
import type { RequestStore } from '../requests/store.js';
import type { NotificationService } from '../notifications/service.js';

export class ChatValidationError extends Error {}

/**
 * 매칭 확정 전에도 대화가 열려야 하는 업체를 알려준다(철거 실사 예약 업체 등).
 *
 * 철거는 현장 실사 일정을 잡아야 견적이 나온다. 그런데 실사는 매칭 **전** 단계라,
 * 참여자를 matchedProviderId 로만 판정하면 정작 이야기가 제일 필요한 구간에서
 * 대화가 막힌다. 채팅이 특정 도메인(견적 저장소)을 직접 알지 않도록 함수로 주입받는다.
 */
export type ExtraParticipantResolver = (requestId: string) => Promise<string[]>;

export class ChatStore {
  private readonly fallbackMessages = new Map<string, ChatMessage>();
  private lastCreatedAt = '';

  constructor(
    private readonly requestStore: RequestStore,
    private readonly notificationService: NotificationService,
    private readonly persistence?: CollectionPersistence<ChatMessage>,
    private readonly extraParticipants?: ExtraParticipantResolver,
  ) {}

  /** 이 요청에서 대화할 수 있는 사람들. 요청자 + 매칭 업체 + (실사 예약 업체). */
  private async participantsOf(requestId: string, matchedProviderId?: string, requesterId?: string) {
    const ids = new Set<string>();
    if (requesterId) ids.add(requesterId);
    if (matchedProviderId) ids.add(matchedProviderId);
    for (const id of (await this.extraParticipants?.(requestId)) ?? []) ids.add(id);
    return ids;
  }

  private async getInner(id: string): Promise<ChatMessage | undefined> {
    if (this.persistence) return this.persistence.get(id);
    return this.fallbackMessages.get(id);
  }

  private async listInner(): Promise<ChatMessage[]> {
    if (this.persistence) return this.persistence.list();
    return [...this.fallbackMessages.values()];
  }

  private async saveInner(message: ChatMessage): Promise<void> {
    if (this.persistence) {
      await this.persistence.save(message);
    } else {
      this.fallbackMessages.set(message.id, message);
    }
  }

  async sendMessage(requestId: string, senderId: string, content: unknown): Promise<ChatMessage> {
    const request = await this.requestStore.get(requestId);
    if (!request) throw new ChatValidationError('요청을 찾을 수 없습니다.');
    const participants = await this.participantsOf(
      requestId,
      request.matchedProviderId,
      request.requesterId,
    );
    // 요청자만 있으면 상대가 없다는 뜻 — 매칭도 실사 예약도 아직 없다.
    if (participants.size < 2) {
      throw new ChatValidationError('업체가 정해진 후에 채팅할 수 있습니다.');
    }
    if (!participants.has(senderId)) {
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
    await this.saveInner(message);
    this.notificationService.notifyChatMessage(request, senderId, message.content);
    return message;
  }

  async listMessages(requestId: string, viewerId: string, since?: string): Promise<ChatMessage[]> {
    const request = await this.requestStore.get(requestId);
    if (!request) throw new ChatValidationError('요청을 찾을 수 없습니다.');
    const participants = await this.participantsOf(
      requestId,
      request.matchedProviderId,
      request.requesterId,
    );
    if (!participants.has(viewerId)) {
      throw new ChatValidationError('요청 당사자만 대화를 볼 수 있습니다.');
    }
    const all = await this.listInner();
    return all
      .filter((m) => m.requestId === requestId && (since === undefined || m.createdAt > since))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async markAsRead(requestId: string, viewerId: string): Promise<void> {
    const all = await this.listInner();
    const unread = all.filter(
      (m) => m.requestId === requestId && m.senderId !== viewerId && !m.readAt
    );
    const now = new Date().toISOString();
    for (const msg of unread) {
      await this.saveInner({ ...msg, readAt: now });
    }
  }
}
