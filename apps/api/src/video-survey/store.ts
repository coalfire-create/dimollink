import type { VideoSurveySession } from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';
import type { VideoRoom } from './provider.js';

/**
 * 서버에만 남기는 세션 기록. 방 정보는 화면에 내보내지 않는다 —
 * 방 주소만으로는 못 들어가지만(비공개 방), 굳이 알릴 이유도 없다.
 */
export interface VideoSurveyRecord extends VideoSurveySession {
  room?: VideoRoom;
}

/** 화면에 내보낼 모양(서버 전용 필드 제거). */
export function toPublicSession(record: VideoSurveyRecord): VideoSurveySession {
  const session: VideoSurveyRecord = { ...record };
  delete session.room;
  return session;
}

/** 영상통화 실사 세션 저장소 — 저장만 한다. 규칙은 [[service]] 에 있다. */
export class VideoSurveyStore {
  private readonly fallback = new Map<string, VideoSurveyRecord>();

  constructor(private readonly persistence?: CollectionPersistence<VideoSurveyRecord>) {}

  async get(id: string): Promise<VideoSurveyRecord | undefined> {
    if (this.persistence) return this.persistence.get(id);
    return this.fallback.get(id);
  }

  async save(record: VideoSurveyRecord): Promise<void> {
    if (this.persistence) await this.persistence.save(record);
    else this.fallback.set(record.id, record);
  }

  async listByRequest(requestId: string): Promise<VideoSurveyRecord[]> {
    const rows = this.persistence
      ? this.persistence.listBy
        ? await this.persistence.listBy({ requestId })
        : (await this.persistence.list()).filter((r) => r.requestId === requestId)
      : [...this.fallback.values()].filter((r) => r.requestId === requestId);
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
