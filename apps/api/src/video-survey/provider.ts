/**
 * 영상통화 방 어댑터 — 올바로·비전 분석·3D 복원과 같은 "목 ↔ 실제" 구조.
 *
 * 실제는 Daily.co([[daily-provider]]), 키가 없으면 목. 목은 **가짜임이 드러나는**
 * 링크를 돌려주고, 화면은 `kind` 를 보고 "테스트 모드"를 표시한다 — 연결되지 않는
 * 통화를 진짜처럼 보여주면 현장에서 사용자가 영문도 모른 채 기다린다.
 */

export interface VideoRoom {
  roomName: string;
  /** 방 주소(입장 링크의 바탕). 단독으로는 들어갈 수 없다 — 비공개 방이다. */
  url: string;
}

export interface VideoParticipant {
  userId: string;
  displayName: string;
  /** 업체는 방 주인(상대 음소거 등), 현장 쪽은 일반 참가자. */
  role: 'PROVIDER' | 'REQUESTER';
}

export interface VideoProvider {
  /** 실제 영상통화인지 목인지. 화면이 그대로 사용자에게 알려야 하는 값이다. */
  readonly kind: 'LIVE' | 'MOCK';
  /** 비공개·2인·녹화 없음 방을 만든다. `expiresAt` 이 지나면 방이 닫힌다. */
  createRoom(sessionId: string, expiresAt: Date): Promise<VideoRoom>;
  /**
   * 한 사람용 입장 링크. 매번 새로 발급한다(링크가 공유돼도 만료되면 끝나도록).
   * 방 주소가 있어야 링크를 만들 수 있어 방 이름 대신 방 전체를 받는다.
   */
  createJoinUrl(room: VideoRoom, participant: VideoParticipant, expiresAt: Date): Promise<string>;
  /** 방을 지운다. 이미 없으면 조용히 넘어간다. */
  deleteRoom(roomName: string): Promise<void>;
}

/** 방 이름 — 세션 id 에서 만든다(사람이 읽을 필요 없음, 추측하기 어렵게 uuid 그대로). */
export function roomNameFor(sessionId: string): string {
  return `dimol-${sessionId}`.slice(0, 64);
}

/**
 * 목 — 키 없이 예약·입장·종료 전 경로를 검증할 수 있게 한다.
 * `.invalid` 는 절대 실재하지 않는 최상위 도메인(RFC 2606)이라 실수로 열려도 아무 데도 안 간다.
 */
export class MockVideoProvider implements VideoProvider {
  readonly kind = 'MOCK' as const;
  readonly deleted: string[] = [];

  async createRoom(sessionId: string): Promise<VideoRoom> {
    const roomName = roomNameFor(sessionId);
    return { roomName, url: `https://video-test.invalid/${roomName}` };
  }

  async createJoinUrl(room: VideoRoom, participant: VideoParticipant): Promise<string> {
    return `${room.url}?test=1&role=${participant.role.toLowerCase()}`;
  }

  async deleteRoom(roomName: string): Promise<void> {
    this.deleted.push(roomName);
  }
}
