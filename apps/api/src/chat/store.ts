import { randomUUID } from 'node:crypto';
import { CHAT_MESSAGE_MAX_LENGTH, type ChatMessage } from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';
import type { RequestStore } from '../requests/store.js';

export class ChatValidationError extends Error {}

export class ChatStore {
  private readonly fallbackMessages = new Map<string, ChatMessage>();
  private lastCreatedAt = '';

  constructor(
    private readonly requestStore: RequestStore,
    private readonly persistence?: CollectionPersistence<ChatMessage>,
  ) {}

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
    return message;
  }

  async listMessages(requestId: string, viewerId: string, since?: string): Promise<ChatMessage[]> {
    const request = await this.requestStore.get(requestId);
    if (!request) throw new ChatValidationError('요청을 찾을 수 없습니다.');
    if (viewerId !== request.requesterId && viewerId !== request.matchedProviderId) {
      throw new ChatValidationError('요청 당사자만 대화를 볼 수 있습니다.');
    }
    const all = await this.listInner();
    return all
      .filter((m) => m.requestId === requestId && (since === undefined || m.createdAt > since))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
