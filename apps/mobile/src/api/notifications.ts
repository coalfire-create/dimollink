import type {
  AppNotification,
  ChatMessage,
} from '@dimol/shared';
import { api } from './http';

/**
 * 알림 · 채팅 API.
 *
 * 공통 인프라(베이스 URL·인증 헤더·오류 처리)는 [[http]] 에 있다.
 */

// ── 알림 (Phase 4)
export const listNotifications = (userId: string) =>
  api<AppNotification[]>(`/notifications?userId=${encodeURIComponent(userId)}`);

// ── 채팅 (Phase 4)
export const listMessages = (requestId: string, viewerId: string, since?: string) =>
  api<ChatMessage[]>(
    `/requests/${requestId}/messages?viewerId=${encodeURIComponent(viewerId)}` +
      (since ? `&since=${encodeURIComponent(since)}` : ''),
  );

export const markMessagesAsRead = (requestId: string) =>
  api<void>(`/requests/${requestId}/messages/read`, {
    method: 'PATCH',
  });

export const sendMessage = (requestId: string, senderId: string, content: string) =>
  api<ChatMessage>(`/requests/${requestId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ senderId, content }),
  });
