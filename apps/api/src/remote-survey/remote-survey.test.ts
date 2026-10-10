import { describe, expect, it } from 'vitest';
import {
  REMOTE_SURVEY_ITEMS,
  REMOTE_SURVEY_MAX_OPEN_SHOT_REQUESTS_PER_PROVIDER,
  REMOTE_SURVEY_MAX_PHOTOS_PER_ITEM,
  REMOTE_SURVEY_MAX_ROOMS,
  REQUIRED_ROOM_SLOTS,
  canOpenMoreShotRequests,
  canSubmitRemoteSurvey,
  computeSurveyCompleteness,
  isRoomComplete,
  parsePhotoKeys,
  parseRemoteSurveyAnswers,
  parseRemoteSurveyItems,
  parseRemoteSurveyRooms,
  remoteSurveyAsbestosSuspected,
  remoteSurveyProviderIds,
  visibleShotRequests,
  type RemoteSurvey,
  type RemoteSurveyAnswers,
  type RemoteSurveyRoom,
  type RemoteSurveyShotRequest,
} from '@dimol/shared';

/**
 * 원격 실사 패키지 규칙 — 진행률·제출 게이트·권한·입력 검증.
 * 화면 진행 막대와 서버 제출 판정이 같은 함수를 쓰므로 여기서 한 번에 지킨다.
 */

let keySeq = 0;
/** 서버 발급 형식의 사진 key. */
function key(): string {
  keySeq += 1;
  const hex = keySeq.toString(16).padStart(12, '0');
  return `site-photos/demolition-request/00000000-0000-4000-8000-${hex}.jpg`;
}
const keys = (n: number) => Array.from({ length: n }, key);

function fullRoom(name = '거실'): RemoteSurveyRoom {
  return {
    id: `room-${name}`,
    name,
    photoKeys: Object.fromEntries(REQUIRED_ROOM_SLOTS.map((slot) => [slot, [key()]])),
  };
}

const FULL_ANSWERS: RemoteSurveyAnswers = {
  basement: 'NO',
  floorsAboveGround: 2,
  roofType: 'TILE',
  knownAsbestos: 'UNKNOWN',
  buildingEmpty: true,
  accessWidth: 'FROM_2M_TO_3M',
};

function emptySurvey(): RemoteSurvey {
  return {
    id: 's1',
    requestId: 'r1',
    requesterId: 'u1',
    status: 'DRAFT',
    rooms: [],
    items: {},
    answers: {},
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

/** 필수 항목을 모두 채운 패키지. */
function completeSurvey(): RemoteSurvey {
  const items: RemoteSurvey['items'] = {};
  for (const item of REMOTE_SURVEY_ITEMS) {
    if (item.requirement === 'REQUIRED' && item.capture !== 'ROOMS') {
      items[item.id] = keys(item.minPhotos);
    }
  }
  return { ...emptySurvey(), rooms: [fullRoom()], items, answers: { ...FULL_ANSWERS } };
}

describe('체크리스트 정의', () => {
  it('업체가 현장에서 보는 항목이 모두 있고 id 가 겹치지 않는다', () => {
    const ids = REMOTE_SURVEY_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      'EXTERIOR',
      'ROOMS',
      'ROOF',
      'CEILING_MATERIAL',
      'FLOOR_MATERIAL',
      'WALL_SECTION',
      'BASEMENT_ENTRANCE',
      'UTILITIES',
      'ACCESS_ROAD',
      'OVERHEAD_WIRES',
      'NEIGHBOR_GAP',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('모든 항목에 안내 문구와 "왜 필요한지"가 있다', () => {
    for (const item of REMOTE_SURVEY_ITEMS) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.instruction.length).toBeGreaterThan(0);
      expect(item.why.length).toBeGreaterThan(0);
      expect(item.minPhotos).toBeGreaterThanOrEqual(1);
    }
  });

  it('방 필수 슬롯은 손상부위(선택)를 뺀 6개다', () => {
    expect(REQUIRED_ROOM_SLOTS).toEqual([
      'FRONT_WALL',
      'RIGHT_WALL',
      'BACK_WALL',
      'LEFT_WALL',
      'FLOOR',
      'CEILING',
    ]);
  });
});

describe('computeSurveyCompleteness', () => {
  it('빈 패키지는 0% 이고 필수 항목과 질문지가 전부 남는다', () => {
    const result = computeSurveyCompleteness(emptySurvey());
    expect(result.ratio).toBe(0);
    expect(result.doneRequired).toBe(0);
    // 필수 8개(외부·방·지붕·천장·바닥·벽·진입로·이웃) + 질문지
    expect(result.totalRequired).toBe(9);
    expect(result.missingRequired).toContain('QUESTIONNAIRE');
    expect(result.missingRequired).not.toContain('UTILITIES');
    expect(result.missingRequired).not.toContain('BASEMENT_ENTRANCE');
  });

  it('필수를 모두 채우면 100% 이고 남은 것이 없다', () => {
    const result = computeSurveyCompleteness(completeSurvey());
    expect(result.ratio).toBe(1);
    expect(result.missingRequired).toEqual([]);
  });

  it('외부는 사진 4장이 모자라도 3D 스캔이 있으면 완료다', () => {
    const survey = { ...completeSurvey(), items: { ...completeSurvey().items, EXTERIOR: keys(2) } };
    expect(computeSurveyCompleteness(survey).missingRequired).toEqual(['EXTERIOR']);
    expect(computeSurveyCompleteness({ ...survey, scanJobId: 'job-1' }).missingRequired).toEqual(
      [],
    );
  });

  it('진입로는 최소 2장이다(큰길 쪽 + 가장 좁은 곳)', () => {
    const survey = completeSurvey();
    survey.items.ACCESS_ROAD = keys(1);
    expect(computeSurveyCompleteness(survey).missingRequired).toEqual(['ACCESS_ROAD']);
  });

  it('방이 없거나, 슬롯이 하나라도 빠진 방이 있으면 미완료다', () => {
    expect(computeSurveyCompleteness({ ...completeSurvey(), rooms: [] }).missingRequired).toEqual([
      'ROOMS',
    ]);
    const partial = fullRoom('안방');
    delete partial.photoKeys.CEILING;
    expect(isRoomComplete(partial)).toBe(false);
    const survey = { ...completeSurvey(), rooms: [fullRoom(), partial] };
    expect(computeSurveyCompleteness(survey).missingRequired).toEqual(['ROOMS']);
  });

  it('지하가 있다고 답하면 지하 입구 사진이 필수가 된다', () => {
    const survey = { ...completeSurvey(), answers: { ...FULL_ANSWERS, basement: 'YES' as const } };
    const result = computeSurveyCompleteness(survey);
    expect(result.totalRequired).toBe(10);
    expect(result.missingRequired).toEqual(['BASEMENT_ENTRANCE']);
    survey.items.BASEMENT_ENTRANCE = keys(1);
    expect(computeSurveyCompleteness(survey).missingRequired).toEqual([]);
  });

  it('"모름"도 답이다 — 지하 모름이면 지하 입구는 선택으로 남는다', () => {
    const survey = {
      ...completeSurvey(),
      answers: { ...FULL_ANSWERS, basement: 'UNKNOWN' as const },
    };
    expect(computeSurveyCompleteness(survey).missingRequired).toEqual([]);
  });

  it('질문 하나라도 빠지면 질문지가 미완료다(메모는 선택)', () => {
    const answers = { ...FULL_ANSWERS };
    delete answers.accessWidth;
    const result = computeSurveyCompleteness({ ...completeSurvey(), answers });
    expect(result.missingRequired).toEqual(['QUESTIONNAIRE']);
    expect(result.ratio).toBeCloseTo(8 / 9);
  });

  it('"비어 있지 않음"(false) 도 답으로 센다', () => {
    const survey = { ...completeSurvey(), answers: { ...FULL_ANSWERS, buildingEmpty: false } };
    expect(computeSurveyCompleteness(survey).missingRequired).toEqual([]);
  });
});

describe('canSubmitRemoteSurvey', () => {
  it('필수가 남아 있으면 남은 항목 이름을 알려 준다', () => {
    const gate = canSubmitRemoteSurvey(emptySurvey());
    expect(gate.ok).toBe(false);
    expect(gate.error).toContain('지붕');
    expect(gate.error).toContain('질문 답하기');
  });

  it('필수가 다 찼으면 제출할 수 있다', () => {
    expect(canSubmitRemoteSurvey(completeSurvey())).toEqual({ ok: true });
  });

  it('이미 보낸 자료는 다시 보낼 수 없다', () => {
    expect(canSubmitRemoteSurvey({ ...completeSurvey(), status: 'SUBMITTED' }).ok).toBe(false);
  });
});

describe('석면 의심 신호', () => {
  it('슬레이트 지붕이거나 석면을 들은 적이 있으면 의심', () => {
    expect(remoteSurveyAsbestosSuspected({ roofType: 'SLATE' })).toBe(true);
    expect(remoteSurveyAsbestosSuspected({ knownAsbestos: 'YES' })).toBe(true);
    expect(remoteSurveyAsbestosSuspected({ roofType: 'TILE', knownAsbestos: 'NO' })).toBe(false);
  });
});

describe('참여 업체 판정', () => {
  it('떨어진 업체는 빼고 매칭된 업체는 넣는다(중복 없음)', () => {
    const ids = remoteSurveyProviderIds(
      [
        { providerId: 'p1', stage: 'PRELIMINARY' },
        { providerId: 'p2', stage: 'DECLINED' },
        { providerId: 'p3', stage: 'FINAL' },
      ],
      'p3',
    );
    expect(ids.sort()).toEqual(['p1', 'p3']);
    expect(remoteSurveyProviderIds([], 'p9')).toEqual(['p9']);
  });
});

describe('추가 촬영 요청 규칙', () => {
  const row = (providerId: string, status: 'OPEN' | 'FULFILLED'): RemoteSurveyShotRequest => ({
    id: `${providerId}-${status}-${Math.random()}`,
    surveyId: 's1',
    requestId: 'r1',
    providerId,
    message: '더 찍어 주세요',
    status,
    photoKeys: [],
    createdAt: '2026-10-01T00:00:00.000Z',
  });

  it('업체당 열린 요청 상한까지만 보낼 수 있다(처리된 것은 세지 않는다)', () => {
    const rows = Array.from({ length: REMOTE_SURVEY_MAX_OPEN_SHOT_REQUESTS_PER_PROVIDER }, () =>
      row('p1', 'OPEN'),
    );
    expect(canOpenMoreShotRequests(rows, 'p1')).toBe(false);
    expect(canOpenMoreShotRequests(rows, 'p2')).toBe(true);
    expect(canOpenMoreShotRequests([...rows.slice(1), row('p1', 'FULFILLED')], 'p1')).toBe(true);
  });

  it('업체는 자기 요청만, 소비자는 전부 본다', () => {
    const rows = [row('p1', 'OPEN'), row('p2', 'OPEN')];
    expect(visibleShotRequests(rows, 'u1', 'u1')).toHaveLength(2);
    expect(visibleShotRequests(rows, 'p1', 'u1').map((r) => r.providerId)).toEqual(['p1']);
  });
});

describe('입력 검증', () => {
  it('서버가 발급하지 않은 사진 key 는 거부한다', () => {
    expect(parsePhotoKeys(['https://evil.example/a.jpg'], 'x').ok).toBe(false);
    expect(parsePhotoKeys('nope', 'x').ok).toBe(false);
    const k = key();
    expect(parsePhotoKeys([k, k], 'x')).toEqual({ ok: true, value: [k] });
  });

  it('항목당 사진 상한을 넘기면 거부한다', () => {
    expect(parsePhotoKeys(keys(REMOTE_SURVEY_MAX_PHOTOS_PER_ITEM + 1), 'x').ok).toBe(false);
  });

  it('방: 이름 필수, 개수 상한, 모르는 슬롯 거부, id 없으면 새로 만든다', () => {
    let n = 0;
    const newId = () => `new-${(n += 1)}`;
    const ok = parseRemoteSurveyRooms(
      [{ name: ' 거실 ', photoKeys: { FRONT_WALL: [key()] } }],
      newId,
    );
    expect(ok.ok && ok.value[0]).toMatchObject({ id: 'new-1', name: '거실' });

    expect(parseRemoteSurveyRooms([{ name: '  ' }], newId).ok).toBe(false);
    expect(
      parseRemoteSurveyRooms([{ name: '거실', photoKeys: { ROOFTOP: [key()] } }], newId).ok,
    ).toBe(false);
    const many = Array.from({ length: REMOTE_SURVEY_MAX_ROOMS + 1 }, (_, i) => ({
      name: `방${i}`,
    }));
    expect(parseRemoteSurveyRooms(many, newId).ok).toBe(false);
    expect(
      parseRemoteSurveyRooms(
        [
          { id: 'a', name: '거실' },
          { id: 'a', name: '안방' },
        ],
        newId,
      ).ok,
    ).toBe(false);
  });

  it('항목: ROOMS 는 항목 사진으로 받지 않는다', () => {
    expect(parseRemoteSurveyItems({ ROOF: [key()] }).ok).toBe(true);
    expect(parseRemoteSurveyItems({ ROOMS: [key()] }).ok).toBe(false);
    expect(parseRemoteSurveyItems({ GARDEN: [key()] }).ok).toBe(false);
  });

  it('질문지: 값 범위를 검증하고 모르는 키는 버린다', () => {
    const ok = parseRemoteSurveyAnswers({ ...FULL_ANSWERS, notes: ' 짐 조금 ', extra: 1 });
    expect(ok).toEqual({ ok: true, value: { ...FULL_ANSWERS, notes: '짐 조금' } });
    expect(parseRemoteSurveyAnswers({ basement: 'MAYBE' }).ok).toBe(false);
    expect(parseRemoteSurveyAnswers({ floorsAboveGround: 0 }).ok).toBe(false);
    expect(parseRemoteSurveyAnswers({ floorsAboveGround: 1.5 }).ok).toBe(false);
    expect(parseRemoteSurveyAnswers({ roofType: 'GOLD' }).ok).toBe(false);
    expect(parseRemoteSurveyAnswers({ buildingEmpty: 'yes' }).ok).toBe(false);
    expect(parseRemoteSurveyAnswers({ accessWidth: '10M' }).ok).toBe(false);
  });
});
