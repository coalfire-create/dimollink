import { useCallback, useEffect, useState } from 'react';
import {
  REMOTE_SURVEY_MAX_PHOTOS_PER_ITEM,
  type RemoteSurvey,
  type RemoteSurveyAnswers,
  type RemoteSurveyItemId,
  type RemoteSurveyShotRequest,
  type SiteCaptureSlotId,
} from '@dimol/shared';
import {
  ApiError,
  createRemoteSurvey,
  fulfilShotRequest,
  getRemoteSurvey,
  listShotRequests,
  submitRemoteSurvey,
  updateRemoteSurvey,
  uploadSitePhoto,
} from '../../api/client';

/**
 * 원격 실사 화면의 데이터와 동작 — 불러오기(없으면 만들기) · 사진 올리기 · 저장 · 보내기.
 *
 * 사진은 찍자마자 한 장씩 올리고(동시에 올리면 오래된 폰에서 메모리가 모자란다),
 * 다 올라간 뒤에만 패키지에 key 를 붙인다. 중간에 실패하면 아무것도 붙지 않아
 * "올라간 줄 알았는데 빠진" 사진이 생기지 않는다.
 */

/** 찍은 사진 한 장(촬영 컴포넌트들이 공통으로 넘기는 모양). */
export interface LocalPhoto {
  uri: string;
  mimeType?: string;
}

async function uploadAll(photos: readonly LocalPhoto[]): Promise<string[]> {
  const keys: string[] = [];
  for (const photo of photos) keys.push(await uploadSitePhoto(photo));
  return keys;
}

const message = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

export function useRemoteSurvey(requestId: string) {
  const [survey, setSurvey] = useState<RemoteSurvey | null>(null);
  const [shotRequests, setShotRequests] = useState<RemoteSurveyShotRequest[]>([]);
  const [loading, setLoading] = useState(true);
  /** 지금 무엇을 하는 중인지 — 화면에 그대로 보여준다(고령 사용자는 멈춘 줄 안다). */
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const current = (await getRemoteSurvey(requestId)) ?? (await createRemoteSurvey(requestId));
      setSurvey(current);
      setShotRequests(current.status === 'SUBMITTED' ? await listShotRequests(current.id) : []);
    } catch (err) {
      setError(message(err, '원격 실사 자료를 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 저장 공통 — 실패하면 화면의 패키지를 그대로 두고 오류만 띄운다. */
  const run = useCallback(
    async (label: string, action: (current: RemoteSurvey) => Promise<RemoteSurvey | void>) => {
      if (!survey) return;
      setBusyLabel(label);
      setError(null);
      try {
        const next = await action(survey);
        if (next) setSurvey(next);
      } catch (err) {
        setError(message(err, '저장하지 못했어요. 다시 해 주세요.'));
      } finally {
        setBusyLabel(null);
      }
    },
    [survey],
  );

  const addItemPhotos = (itemId: RemoteSurveyItemId, photos: readonly LocalPhoto[]) =>
    run('사진을 올리는 중이에요', async (current) => {
      const keys = await uploadAll(photos);
      const merged = [...(current.items[itemId] ?? []), ...keys].slice(
        -REMOTE_SURVEY_MAX_PHOTOS_PER_ITEM,
      );
      return updateRemoteSurvey(current.id, { items: { ...current.items, [itemId]: merged } });
    });

  const clearItemPhotos = (itemId: RemoteSurveyItemId) =>
    run('지우는 중이에요', async (current) => {
      const items = { ...current.items };
      delete items[itemId];
      return updateRemoteSurvey(current.id, { items });
    });

  const addRoom = (name: string) =>
    run('방을 넣는 중이에요', (current) =>
      updateRemoteSurvey(current.id, {
        rooms: [...current.rooms, { name: name.trim(), photoKeys: {} }],
      }),
    );

  const removeRoom = (roomId: string) =>
    run('방을 빼는 중이에요', (current) =>
      updateRemoteSurvey(current.id, { rooms: current.rooms.filter((r) => r.id !== roomId) }),
    );

  /** 가이드 촬영 한 바퀴의 결과로 그 방의 사진을 통째로 바꾼다(다시 찍기 = 덮어쓰기). */
  const setRoomPhotos = (roomId: string, photos: readonly (LocalPhoto & { slotId: string })[]) =>
    run('방 사진을 올리는 중이에요', async (current) => {
      const photoKeys: Partial<Record<SiteCaptureSlotId, string[]>> = {};
      for (const photo of photos) {
        const [key] = await uploadAll([photo]);
        const slot = photo.slotId as SiteCaptureSlotId;
        photoKeys[slot] = [...(photoKeys[slot] ?? []), key!].slice(
          0,
          REMOTE_SURVEY_MAX_PHOTOS_PER_ITEM,
        );
      }
      return updateRemoteSurvey(current.id, {
        rooms: current.rooms.map((r) => (r.id === roomId ? { ...r, photoKeys } : r)),
      });
    });

  /** 3D 스캔 잡을 붙이거나(null 이면) 뗀다. */
  const setScanJob = (jobId: string | null) =>
    run('저장하는 중이에요', (current) => updateRemoteSurvey(current.id, { scanJobId: jobId }));

  const saveAnswers = (answers: RemoteSurveyAnswers) =>
    run('답을 저장하는 중이에요', (current) => updateRemoteSurvey(current.id, { answers }));

  const submit = () => run('업체에 보내는 중이에요', (current) => submitRemoteSurvey(current.id));

  const fulfil = (shotRequestId: string, photos: readonly LocalPhoto[]) =>
    run('사진을 보내는 중이에요', async () => {
      const keys = await uploadAll(photos);
      const done = await fulfilShotRequest(shotRequestId, keys);
      setShotRequests((rows) => rows.map((r) => (r.id === done.id ? done : r)));
    });

  return {
    survey,
    shotRequests,
    loading,
    busyLabel,
    error,
    load,
    addItemPhotos,
    clearItemPhotos,
    addRoom,
    removeRoom,
    setRoomPhotos,
    setScanJob,
    saveAnswers,
    submit,
    fulfil,
  };
}

export type RemoteSurveyController = ReturnType<typeof useRemoteSurvey>;
