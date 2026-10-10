import { randomUUID } from 'node:crypto';
import {
  REMOTE_SURVEY_MAX_OPEN_SHOT_REQUESTS_PER_PROVIDER,
  REMOTE_SURVEY_TEXT_MAX,
  canOpenMoreShotRequests,
  remoteSurveyItem,
  visibleShotRequests,
  type RemoteSurveyItemId,
  type RemoteSurveyShotRequest,
} from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';
import { RemoteSurveyError, type RemoteSurveyStore, type SurveyNotifier } from './store.js';

/**
 * 추가 촬영 요청 저장소 — 업체: "이것 더 찍어 주세요" → 소비자: 찍어서 보내기.
 *
 * 현장에서 "저기 좀 보여주세요" 하던 것을 대신한다. 이게 없으면 업체는 모자란 자료로
 * 금액을 넓게 부르거나 결국 방문하러 간다.
 */

export interface CreateShotRequestInput {
  itemId?: RemoteSurveyItemId;
  message: string;
}

export class RemoteSurveyShotRequestStore {
  private readonly fallbackMap = new Map<string, RemoteSurveyShotRequest>();

  constructor(
    private readonly surveys: RemoteSurveyStore,
    private readonly persistence?: CollectionPersistence<RemoteSurveyShotRequest>,
    private readonly notify?: SurveyNotifier,
  ) {}

  private async announce(requestId: string, userId: string, message: string): Promise<void> {
    try {
      await this.notify?.(requestId, userId, message);
    } catch {
      // 알림 실패가 요청·제출을 막지 않게 한다.
    }
  }

  private async save(row: RemoteSurveyShotRequest): Promise<void> {
    if (this.persistence) await this.persistence.save(row);
    else this.fallbackMap.set(row.id, row);
  }

  private async listBySurvey(surveyId: string): Promise<RemoteSurveyShotRequest[]> {
    const rows = this.persistence
      ? this.persistence.listBy
        ? await this.persistence.listBy({ surveyId })
        : (await this.persistence.list()).filter((r) => r.surveyId === surveyId)
      : [...this.fallbackMap.values()].filter((r) => r.surveyId === surveyId);
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** 업체가 요청한다 — 이 요청의 견적에 참여 중인 업체만, 제출된 자료에만. */
  async create(
    surveyId: string,
    providerId: string,
    input: CreateShotRequestInput,
  ): Promise<RemoteSurveyShotRequest> {
    const survey = await this.surveys.get(surveyId);
    if (!survey) throw new RemoteSurveyError('원격 실사 자료를 찾을 수 없습니다.', 404);
    if (!(await this.surveys.participantsOf(survey.requestId)).includes(providerId)) {
      throw new RemoteSurveyError('이 요청의 견적에 참여한 업체만 요청할 수 있습니다.', 403);
    }
    if (survey.status !== 'SUBMITTED') {
      throw new RemoteSurveyError('소비자가 자료를 보낸 뒤에 요청할 수 있습니다.', 409);
    }

    const message = input.message.trim();
    if (!message || message.length > REMOTE_SURVEY_TEXT_MAX) {
      throw new RemoteSurveyError(
        `무엇을 찍어야 하는지 ${REMOTE_SURVEY_TEXT_MAX}자 이내로 적어 주세요.`,
      );
    }
    if (!canOpenMoreShotRequests(await this.listBySurvey(surveyId), providerId)) {
      throw new RemoteSurveyError(
        `아직 처리되지 않은 요청이 ${REMOTE_SURVEY_MAX_OPEN_SHOT_REQUESTS_PER_PROVIDER}건 있습니다. 소비자가 보낸 뒤 다시 요청해 주세요.`,
        409,
      );
    }

    const row: RemoteSurveyShotRequest = {
      id: randomUUID(),
      surveyId,
      requestId: survey.requestId,
      providerId,
      ...(input.itemId ? { itemId: input.itemId } : {}),
      message,
      status: 'OPEN',
      photoKeys: [],
      createdAt: new Date().toISOString(),
    };
    await this.save(row);
    const what = input.itemId ? remoteSurveyItem(input.itemId)?.title : undefined;
    await this.announce(
      survey.requestId,
      survey.requesterId,
      what ? `업체가 사진을 더 부탁했어요: ${what}` : '업체가 사진을 더 부탁했어요.',
    );
    return row;
  }

  /** 소비자는 전부, 업체는 자기가 보낸 것만 본다. */
  async list(surveyId: string, viewerId: string): Promise<RemoteSurveyShotRequest[]> {
    const survey = await this.surveys.get(surveyId);
    if (!survey) throw new RemoteSurveyError('원격 실사 자료를 찾을 수 없습니다.', 404);
    if (!(await this.surveys.canView(survey, viewerId))) {
      throw new RemoteSurveyError('이 요청의 견적에 참여한 업체만 볼 수 있습니다.', 403);
    }
    return visibleShotRequests(await this.listBySurvey(surveyId), viewerId, survey.requesterId);
  }

  /** 소비자가 찍어서 보낸다. 사진 key 형식 검증은 라우트가 이미 했다. */
  async fulfil(
    shotRequestId: string,
    requesterId: string,
    photoKeys: string[],
  ): Promise<RemoteSurveyShotRequest> {
    const row = await this.getRow(shotRequestId);
    if (!row) throw new RemoteSurveyError('추가 촬영 요청을 찾을 수 없습니다.', 404);
    const survey = await this.surveys.get(row.surveyId);
    if (!survey || survey.requesterId !== requesterId) {
      throw new RemoteSurveyError('본인에게 온 요청만 보낼 수 있습니다.', 403);
    }
    if (row.status !== 'OPEN') throw new RemoteSurveyError('이미 보낸 요청입니다.', 409);
    if (photoKeys.length === 0) throw new RemoteSurveyError('사진을 한 장 이상 찍어 주세요.');

    const fulfilled: RemoteSurveyShotRequest = {
      ...row,
      status: 'FULFILLED',
      photoKeys,
      fulfilledAt: new Date().toISOString(),
    };
    await this.save(fulfilled);
    await this.announce(row.requestId, row.providerId, '부탁하신 사진이 도착했어요.');
    return fulfilled;
  }

  private async getRow(id: string): Promise<RemoteSurveyShotRequest | undefined> {
    if (this.persistence) return this.persistence.get(id);
    return this.fallbackMap.get(id);
  }
}
