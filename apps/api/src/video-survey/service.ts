import { randomUUID } from 'node:crypto';
import {
  canJoinVideoSurvey,
  canTransitionVideoSurvey,
  isVideoSurveyOpen,
  isVideoSurveyParty,
  validateProposedTimes,
  videoSurveyDurationSec,
  videoSurveyJoinWindow,
  type VideoSurveySession,
  type VideoSurveyStatus,
} from '@dimol/shared';
import type { RequestStore } from '../requests/store.js';
import type { VideoProvider } from './provider.js';
import { toPublicSession, type VideoSurveyRecord, type VideoSurveyStore } from './store.js';

/**
 * 영상통화 실사 규칙 — 누가 무엇을 언제 할 수 있는가.
 *
 * 판정(전이·입장 시간·제안 시간)은 공유 순수 함수([[video-survey]])에 있고, 여기서는
 * 권한과 순서, 그리고 방 만들기·입장 링크 발급을 맡는다. 견적 저장소·알림은 함수로
 * 주입받아 이 파일이 다른 도메인을 직접 알지 않게 한다(배선은 app.ts).
 */

export class VideoSurveyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

/** 이 요청에 견적을 낸(거절되지 않은) 철거업체. 통화를 걸 수 있는 사람은 이들뿐이다. */
export interface InvolvedProvider {
  providerId: string;
  estimateId: string;
  providerName?: string;
}

/**
 * 견적의 실사를 원격(REMOTE)으로 기록/해제한다. 예약되면 걸고, 취소되면 푼다 —
 * 취소된 통화가 "실사 완료"처럼 남으면 확정 견적을 낼 근거가 사라진 채 열려 버린다.
 */
export interface RemoteVisitLink {
  link(estimateId: string, requesterId: string, scheduledAt: string, sessionId: string): Promise<void>;
  unlink(estimateId: string, sessionId: string): Promise<void>;
}

export interface VideoSurveyServiceDeps {
  store: VideoSurveyStore;
  requestStore: RequestStore;
  video: VideoProvider;
  involvedProviders: (requestId: string) => Promise<InvolvedProvider[]>;
  remoteVisit?: RemoteVisitLink;
  notify?: (requestId: string, userId: string, message: string) => void | Promise<void>;
  displayName?: (userId: string) => Promise<string | undefined>;
  now?: () => Date;
}

export interface JoinResult {
  url: string;
  /** 목 공급자면 true — 화면이 "테스트 모드"를 띄우고 링크를 열지 않는다. */
  testMode: boolean;
  closesAt: string;
  session: VideoSurveySession;
}

export class VideoSurveyService {
  /** 같은 세션에 두 사람이 동시에 들어와도 방이 두 개 생기지 않게 세션별로 줄 세운다. */
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: VideoSurveyServiceDeps) {}

  get testMode(): boolean {
    return this.deps.video.kind === 'MOCK';
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private async announce(requestId: string, userId: string, message: string): Promise<void> {
    try {
      await this.deps.notify?.(requestId, userId, message);
    } catch {
      // 알림 실패가 통화 예약을 막으면 안 된다.
    }
  }

  private serialize<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    this.locks.set(id, next);
    void next.finally(() => {
      if (this.locks.get(id) === next) this.locks.delete(id);
    }).catch(() => undefined);
    return next;
  }

  private async requireSession(id: string): Promise<VideoSurveyRecord> {
    const session = await this.deps.store.get(id);
    if (!session) throw new VideoSurveyError('영상통화를 찾을 수 없습니다.', 404);
    return session;
  }

  private requireParty(session: VideoSurveyRecord, userId: string): void {
    if (!isVideoSurveyParty(session, userId)) {
      throw new VideoSurveyError('통화 당사자만 할 수 있습니다.', 403);
    }
  }

  private move(session: VideoSurveyRecord, to: VideoSurveyStatus): void {
    if (!canTransitionVideoSurvey(session.status, to)) {
      throw new VideoSurveyError('지금 상태에서는 할 수 없습니다.', 409);
    }
  }

  /** 요청자는 전부, 업체는 자기 것만 본다(다른 업체의 일정은 견적 밀봉과 같은 이유로 숨긴다). */
  async list(requestId: string, viewerId: string): Promise<VideoSurveySession[]> {
    const request = await this.deps.requestStore.get(requestId);
    if (!request) throw new VideoSurveyError('요청을 찾을 수 없습니다.', 404);
    const rows = await this.deps.store.listByRequest(requestId);
    const visible =
      request.requesterId === viewerId ? rows : rows.filter((s) => s.providerId === viewerId);
    return visible.map(toPublicSession);
  }

  /** 업체가 통화를 요청하며 가능한 시간을 제안한다. */
  async request(
    requestId: string,
    providerId: string,
    proposedAt: unknown,
  ): Promise<VideoSurveySession> {
    const request = await this.deps.requestStore.get(requestId);
    if (!request) throw new VideoSurveyError('요청을 찾을 수 없습니다.', 404);
    if (request.kind !== 'DEMOLITION' || request.status === 'CANCELLED') {
      throw new VideoSurveyError('진행 중인 철거 요청에만 영상통화를 요청할 수 있습니다.');
    }
    const involved = (await this.deps.involvedProviders(requestId)).find(
      (p) => p.providerId === providerId,
    );
    if (!involved) {
      throw new VideoSurveyError('이 요청에 견적을 낸 업체만 영상통화를 요청할 수 있습니다.', 403);
    }
    const existing = await this.deps.store.listByRequest(requestId);
    if (existing.some((s) => s.providerId === providerId && isVideoSurveyOpen(s.status))) {
      throw new VideoSurveyError('이미 진행 중인 영상통화 요청이 있습니다.', 409);
    }
    const times = validateProposedTimes(proposedAt, this.now());
    if (!times.ok) throw new VideoSurveyError(times.error);

    const session: VideoSurveyRecord = {
      id: randomUUID(),
      requestId,
      estimateId: involved.estimateId,
      providerId,
      providerName: involved.providerName,
      requesterId: request.requesterId,
      status: 'REQUESTED',
      proposedAt: times.times,
      createdAt: this.now().toISOString(),
    };
    await this.deps.store.save(session);
    await this.announce(
      requestId,
      request.requesterId,
      `${involved.providerName ?? '철거업체'}에서 영상통화 실사를 요청했어요. 가능한 시간을 골라 주세요.`,
    );
    return toPublicSession(session);
  }

  /** 요청자가 제안된 시간 중 하나를 고른다 → 예약. 연결된 견적의 실사가 원격으로 잡힌다. */
  async accept(sessionId: string, userId: string, scheduledAt: unknown): Promise<VideoSurveySession> {
    return this.serialize(sessionId, async () => {
      const session = await this.requireSession(sessionId);
      if (session.requesterId !== userId) {
        throw new VideoSurveyError('요청하신 분만 시간을 고를 수 있습니다.', 403);
      }
      this.move(session, 'SCHEDULED');
      const pickedMs = typeof scheduledAt === 'string' ? Date.parse(scheduledAt) : NaN;
      const picked = (session.proposedAt ?? []).find((t) => Date.parse(t) === pickedMs);
      if (!picked) throw new VideoSurveyError('제안된 시간 중에서 골라 주세요.');
      if (this.now().getTime() >= Date.parse(videoSurveyJoinWindow(picked).closesAt)) {
        throw new VideoSurveyError('이미 지난 시간입니다. 업체에 새 시간을 요청해 주세요.');
      }

      // 견적 쪽이 거절하면(실사 상한 등) 예약도 하지 않는다 — 둘이 어긋나면 안 된다.
      if (session.estimateId && this.deps.remoteVisit) {
        try {
          await this.deps.remoteVisit.link(session.estimateId, userId, picked, session.id);
        } catch (err) {
          throw new VideoSurveyError(err instanceof Error ? err.message : '실사 예약 실패');
        }
      }
      const updated: VideoSurveyRecord = { ...session, status: 'SCHEDULED', scheduledAt: picked };
      await this.deps.store.save(updated);
      await this.announce(
        session.requestId,
        session.providerId,
        `영상통화 실사가 예약되었어요. ${new Date(picked).toLocaleString('ko-KR')}`,
      );
      return toPublicSession(updated);
    });
  }

  /** 입장 — 두 당사자에게만, 입장 시간 안에서만, 매번 새 링크를 준다. */
  async join(sessionId: string, userId: string): Promise<JoinResult> {
    return this.serialize(sessionId, async () => {
      const session = await this.requireSession(sessionId);
      this.requireParty(session, userId);
      const now = this.now();
      if (!canJoinVideoSurvey(session, now)) {
        throw new VideoSurveyError('지금은 참여할 수 있는 시간이 아닙니다.', 409);
      }
      const { closesAt } = videoSurveyJoinWindow(session.scheduledAt!);
      const expiresAt = new Date(closesAt);
      const room = session.room ?? (await this.deps.video.createRoom(session.id, expiresAt));
      const isProvider = session.providerId === userId;
      const url = await this.deps.video.createJoinUrl(
        room,
        {
          userId,
          displayName:
            (await this.deps.displayName?.(userId)) ?? (isProvider ? '업체' : '현장'),
          role: isProvider ? 'PROVIDER' : 'REQUESTER',
        },
        expiresAt,
      );
      const firstJoin = session.status === 'SCHEDULED';
      const updated: VideoSurveyRecord = firstJoin
        ? { ...session, room, status: 'LIVE', startedAt: now.toISOString() }
        : { ...session, room };
      await this.deps.store.save(updated);
      if (firstJoin) {
        await this.announce(
          session.requestId,
          isProvider ? session.requesterId : session.providerId,
          '상대방이 영상통화에 들어왔어요. 지금 참여해 주세요.',
        );
      }
      return { url, testMode: this.testMode, closesAt, session: toPublicSession(updated) };
    });
  }

  /** 통화 종료 — 통화 시간을 남기고 방을 지운다(남은 방은 비용·노출의 원인). */
  async end(sessionId: string, userId: string): Promise<VideoSurveySession> {
    return this.serialize(sessionId, async () => {
      const session = await this.requireSession(sessionId);
      this.requireParty(session, userId);
      this.move(session, 'ENDED');
      const endedAt = this.now().toISOString();
      const updated: VideoSurveyRecord = {
        ...session,
        status: 'ENDED',
        endedAt,
        durationSec: videoSurveyDurationSec(session.startedAt ?? endedAt, endedAt),
      };
      await this.deps.store.save(updated);
      await this.dropRoom(session);
      return toPublicSession(updated);
    });
  }

  /** 취소 — 예약 전·후 모두 양쪽 누구나. 견적에 건 원격 실사도 푼다. */
  async cancel(sessionId: string, userId: string): Promise<VideoSurveySession> {
    return this.serialize(sessionId, async () => {
      const session = await this.requireSession(sessionId);
      this.requireParty(session, userId);
      this.move(session, 'CANCELLED');
      const updated: VideoSurveyRecord = { ...session, status: 'CANCELLED', cancelledBy: userId };
      await this.deps.store.save(updated);
      await this.dropRoom(session);
      if (session.estimateId && session.status === 'SCHEDULED') {
        try {
          await this.deps.remoteVisit?.unlink(session.estimateId, session.id);
        } catch {
          // 확정 견적이 이미 나왔으면 되돌리지 않는다 — 취소는 그대로 유효하다.
        }
      }
      const other = session.providerId === userId ? session.requesterId : session.providerId;
      await this.announce(session.requestId, other, '영상통화 실사가 취소되었어요.');
      return toPublicSession(updated);
    });
  }

  private async dropRoom(session: VideoSurveyRecord): Promise<void> {
    if (!session.room) return;
    try {
      await this.deps.video.deleteRoom(session.room.roomName);
    } catch {
      // 방은 어차피 만료 시각에 닫힌다 — 지우기 실패로 종료·취소를 막지 않는다.
    }
  }
}
