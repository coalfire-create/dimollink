import {
  roomNameFor,
  type VideoParticipant,
  type VideoProvider,
  type VideoRoom,
} from './provider.js';

/**
 * Daily.co REST API 어댑터.
 *
 * 필드 이름은 Daily 문서(2026-10 확인) 기준:
 *  - POST /v1/rooms        { name, privacy, properties: { exp, max_participants, eject_at_room_exp } }
 *  - POST /v1/meeting-tokens { properties: { room_name, exp, user_name, user_id, is_owner, eject_at_token_exp } }
 *  - DELETE /v1/rooms/:name
 * 비공개 방은 토큰 없이는 못 들어간다. 브라우저 입장은 `방주소?t=토큰` 형식.
 *
 * 녹화: Daily 는 `enable_recording` 을 **넣지 않으면** 녹화가 꺼진다. 그래서 이 필드를
 * 아예 보내지 않는다([[video-survey]] VIDEO_SURVEY_RECORDING_ENABLED — 바꾸려면
 * 동의·보관 규정부터 만들고 여기에 필드를 더한다).
 */

export interface DailyVideoProviderConfig {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** 테스트에서 네트워크 대신 끼워 넣는다. */
  fetchImpl?: typeof fetch;
}

export class DailyVideoError extends Error {}

export class DailyVideoProvider implements VideoProvider {
  readonly kind = 'LIVE' as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: DailyVideoProviderConfig) {
    this.baseUrl = (config.baseUrl ?? 'https://api.daily.co/v1').replace(/\/$/, '');
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async call(method: string, path: string, body?: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 10_000);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          'content-type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (method === 'DELETE' && res.status === 404) return {};
      if (!res.ok) {
        // 응답 본문은 남기지 않는다 — 키·토큰 조각이 섞여 로그로 새는 것을 막는다.
        throw new DailyVideoError(`영상통화 서버 오류(${res.status})`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async createRoom(sessionId: string, expiresAt: Date): Promise<VideoRoom> {
    const properties: Record<string, unknown> = {
      exp: Math.floor(expiresAt.getTime() / 1000),
      // 업체 1 + 현장 1. 링크가 퍼져도 제3자가 끼어들 수 없다.
      max_participants: 2,
      // 만료 시각에 통화 중이어도 내보낸다 — 최대 통화 시간이 비용 상한이 되게.
      eject_at_room_exp: true,
    };
    const data = (await this.call('POST', '/rooms', {
      name: roomNameFor(sessionId),
      privacy: 'private',
      properties,
    })) as { name?: unknown; url?: unknown };
    if (typeof data.name !== 'string' || typeof data.url !== 'string') {
      throw new DailyVideoError('영상통화 방 응답이 올바르지 않습니다.');
    }
    return { roomName: data.name, url: data.url };
  }

  async createJoinUrl(
    room: VideoRoom,
    participant: VideoParticipant,
    expiresAt: Date,
  ): Promise<string> {
    const data = (await this.call('POST', '/meeting-tokens', {
      properties: {
        room_name: room.roomName,
        exp: Math.floor(expiresAt.getTime() / 1000),
        user_name: participant.displayName,
        // Daily 는 36자 제한 — uuid 는 정확히 36자다.
        user_id: participant.userId.slice(0, 36),
        is_owner: participant.role === 'PROVIDER',
        eject_at_token_exp: true,
      },
    })) as { token?: unknown };
    if (typeof data.token !== 'string') {
      throw new DailyVideoError('영상통화 입장 토큰 응답이 올바르지 않습니다.');
    }
    return `${room.url}?t=${encodeURIComponent(data.token)}`;
  }

  async deleteRoom(roomName: string): Promise<void> {
    await this.call('DELETE', `/rooms/${encodeURIComponent(roomName)}`);
  }
}
