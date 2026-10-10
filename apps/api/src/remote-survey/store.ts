import { randomUUID } from 'node:crypto';
import {
  canSubmitRemoteSurvey,
  type RemoteSurvey,
  type RemoteSurveyAnswers,
  type RemoteSurveyItemId,
  type RemoteSurveyRoom,
} from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';
import type { RequestStore } from '../requests/store.js';

/**
 * 원격 실사 촬영 패키지 저장소 — 소비자가 찍고, 견적에 참여한 업체가 본다.
 *
 * 무엇이 "완료"이고 언제 제출할 수 있는지는 공유 순수 함수([[remote-survey]])에 있다.
 * 여기서는 순서(작성 중 → 제출)와 권한(누가 고치고 누가 보는가)만 지킨다.
 */

/** 상태 코드를 함께 들고 다닌다 — 문구로 404/403 을 추측하지 않게. */
export class RemoteSurveyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

/**
 * 이 요청의 철거 견적에 지금 참여 중인 업체 id 목록.
 * 견적 저장소를 직접 알지 않도록 함수로 주입받는다(배선은 app.ts).
 */
export type SurveyParticipants = (requestId: string) => Promise<string[]>;

/** 알림 — 견적 흐름과 같은 채널을 쓴다. 실패해도 저장은 끝나야 한다. */
export type SurveyNotifier = (
  requestId: string,
  userId: string,
  message: string,
) => void | Promise<void>;

/** 소비자가 고칠 수 있는 부분. 준 필드만 통째로 바꾼다(부분 병합은 화면이 한다). */
export interface RemoteSurveyPatch {
  rooms?: RemoteSurveyRoom[];
  items?: Partial<Record<RemoteSurveyItemId, string[]>>;
  answers?: RemoteSurveyAnswers;
  /** null 이면 스캔 연결을 끊는다. */
  scanJobId?: string | null;
}

export class RemoteSurveyStore {
  private readonly fallbackMap = new Map<string, RemoteSurvey>();

  constructor(
    private readonly requestStore: RequestStore,
    private readonly participants: SurveyParticipants,
    private readonly persistence?: CollectionPersistence<RemoteSurvey>,
    private readonly notify?: SurveyNotifier,
  ) {}

  private async announce(requestId: string, userId: string, message: string): Promise<void> {
    try {
      await this.notify?.(requestId, userId, message);
    } catch {
      // 알림은 부가 기능 — 여기서 막히면 촬영 자료가 저장되지 않는다.
    }
  }

  private async save(survey: RemoteSurvey): Promise<void> {
    if (this.persistence) await this.persistence.save(survey);
    else this.fallbackMap.set(survey.id, survey);
  }

  async get(id: string): Promise<RemoteSurvey | undefined> {
    if (this.persistence) return this.persistence.get(id);
    return this.fallbackMap.get(id);
  }

  /** 요청 하나에 패키지는 하나다(같은 집을 두 번 찍게 하지 않는다). */
  async getByRequest(requestId: string): Promise<RemoteSurvey | undefined> {
    const rows = this.persistence
      ? this.persistence.listBy
        ? await this.persistence.listBy({ requestId })
        : (await this.persistence.list()).filter((s) => s.requestId === requestId)
      : [...this.fallbackMap.values()].filter((s) => s.requestId === requestId);
    return rows[0];
  }

  /** 이 요청의 참여 업체 — 추가 촬영 요청 저장소도 같은 판정을 쓴다. */
  participantsOf(requestId: string): Promise<string[]> {
    return this.participants(requestId);
  }

  /** 열람 권한: 소비자 본인 + 이 요청의 철거 견적에 참여 중인 업체. */
  async canView(survey: RemoteSurvey, viewerId: string): Promise<boolean> {
    if (survey.requesterId === viewerId) return true;
    return (await this.participants(survey.requestId)).includes(viewerId);
  }

  /** 요청 기준 조회(권한 확인 포함). 없으면 404 — 아직 안 만든 것이다. */
  async viewByRequest(requestId: string, viewerId: string): Promise<RemoteSurvey> {
    const request = await this.requestStore.get(requestId);
    if (!request) throw new RemoteSurveyError('요청을 찾을 수 없습니다.', 404);
    const isRequester = request.requesterId === viewerId;
    if (!isRequester && !(await this.participants(requestId)).includes(viewerId)) {
      throw new RemoteSurveyError('이 요청의 견적에 참여한 업체만 볼 수 있습니다.', 403);
    }
    const survey = await this.getByRequest(requestId);
    if (!survey) throw new RemoteSurveyError('원격 실사 자료를 찾을 수 없습니다.', 404);
    // 업체에게는 다 찍기 전의 반쪽짜리 자료를 보이지 않는다 — 그걸로 금액을 부르면 틀린다.
    if (!isRequester && survey.status !== 'SUBMITTED') {
      throw new RemoteSurveyError('원격 실사 자료를 찾을 수 없습니다.', 404);
    }
    return survey;
  }

  /** 새로 만들거나, 이미 있으면 그것을 돌려준다(두 번 눌러도 하나). */
  async create(
    requestId: string,
    requesterId: string,
  ): Promise<{ survey: RemoteSurvey; created: boolean }> {
    const request = await this.requestStore.get(requestId);
    if (!request) throw new RemoteSurveyError('요청을 찾을 수 없습니다.', 404);
    if (request.requesterId !== requesterId) {
      throw new RemoteSurveyError('본인 요청에만 원격 실사 자료를 만들 수 있습니다.', 403);
    }
    if (request.kind !== 'DEMOLITION') {
      throw new RemoteSurveyError('철거 요청에만 원격 실사를 쓸 수 있습니다.');
    }
    const existing = await this.getByRequest(requestId);
    if (existing) return { survey: existing, created: false };
    if (request.status !== 'REQUESTED') {
      throw new RemoteSurveyError('견적을 받는 중인 요청에만 원격 실사를 할 수 있습니다.', 409);
    }

    const now = new Date().toISOString();
    const survey: RemoteSurvey = {
      id: randomUUID(),
      requestId,
      requesterId,
      status: 'DRAFT',
      rooms: [],
      items: {},
      answers: {},
      createdAt: now,
      updatedAt: now,
    };
    await this.save(survey);
    return { survey, created: true };
  }

  /** 작성 중에만 고친다. 보낸 뒤 빠진 것은 업체의 추가 촬영 요청으로 채운다. */
  async update(id: string, requesterId: string, patch: RemoteSurveyPatch): Promise<RemoteSurvey> {
    const survey = await this.requireOwnDraft(id, requesterId);
    const updated: RemoteSurvey = {
      ...survey,
      ...(patch.rooms !== undefined ? { rooms: patch.rooms } : {}),
      ...(patch.items !== undefined ? { items: patch.items } : {}),
      ...(patch.answers !== undefined ? { answers: patch.answers } : {}),
      updatedAt: new Date().toISOString(),
    };
    if (patch.scanJobId === null) delete updated.scanJobId;
    else if (patch.scanJobId !== undefined) updated.scanJobId = patch.scanJobId;
    await this.save(updated);
    return updated;
  }

  /** 제출 — 필수가 다 찼을 때만. 참여 업체에게 알린다(알림이 없으면 아무도 안 본다). */
  async submit(id: string, requesterId: string): Promise<RemoteSurvey> {
    const survey = await this.requireOwnDraft(id, requesterId);
    const gate = canSubmitRemoteSurvey(survey);
    if (!gate.ok) throw new RemoteSurveyError(gate.error!);

    const now = new Date().toISOString();
    const submitted: RemoteSurvey = {
      ...survey,
      status: 'SUBMITTED',
      submittedAt: now,
      updatedAt: now,
    };
    await this.save(submitted);
    for (const providerId of await this.participants(survey.requestId)) {
      await this.announce(
        survey.requestId,
        providerId,
        '원격 실사 사진이 도착했어요. 현장에 가지 않고 확인할 수 있어요.',
      );
    }
    return submitted;
  }

  private async requireOwnDraft(id: string, requesterId: string): Promise<RemoteSurvey> {
    const survey = await this.get(id);
    if (!survey) throw new RemoteSurveyError('원격 실사 자료를 찾을 수 없습니다.', 404);
    if (survey.requesterId !== requesterId) {
      throw new RemoteSurveyError('본인 자료만 고칠 수 있습니다.', 403);
    }
    if (survey.status !== 'DRAFT') {
      throw new RemoteSurveyError('이미 보낸 자료는 고칠 수 없습니다.', 409);
    }
    return survey;
  }
}
