import { CHAT_MESSAGE_MAX_LENGTH } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { RequestStore } from '../requests/store.js';
import { ChatStore, ChatValidationError } from './store.js';

async function setup(matched = true) {
  const requestStore = new RequestStore();
  const store = new ChatStore(requestStore);
  const request = await requestStore.create({
    kind: 'DEMOLITION',
    requesterId: 'd-1',
    region: '양평',
    wasteCategory: 'CONSTRUCTION',
    wasteTons: 7,
    allbaroRequested: false,
    siteAddress: '양평군 현장',
  });
  if (matched) await requestStore.changeStatus(request.id, 'MATCHED', { matchedProviderId: 'p-1' });
  return { requestStore, store, request };
}

describe('ChatStore — 인앱 채팅', () => {
  it('당사자끼리 주고받고 대화 순서(오래된 순)로 조회', async () => {
    const { store, request } = await setup();
    await store.sendMessage(request.id, 'd-1', '내일 오전 반입 가능할까요?');
    await store.sendMessage(request.id, 'p-1', '네, 9시까지 도착하겠습니다.');

    const thread = await store.listMessages(request.id, 'd-1');
    expect(thread.map((m) => m.senderId)).toEqual(['d-1', 'p-1']);
    expect(thread[1].content).toBe('네, 9시까지 도착하겠습니다.');
  });

  it('매칭 확정 전에는 채팅 불가', async () => {
    const { store, request } = await setup(false);
    await expect(store.sendMessage(request.id, 'd-1', '안녕하세요')).rejects.toThrow(
      '업체 매칭이 확정된 후에',
    );
  });

  it('당사자가 아니면 발신·조회 모두 거부', async () => {
    const { store, request } = await setup();
    await store.sendMessage(request.id, 'd-1', '문의드립니다');
    await expect(store.sendMessage(request.id, '외부인', '끼어들기')).rejects.toThrow(
      ChatValidationError,
    );
    await expect(store.listMessages(request.id, '외부인')).rejects.toThrow(ChatValidationError);
  });

  it('빈 메시지·최대 길이 초과 거부, 앞뒤 공백은 정리', async () => {
    const { store, request } = await setup();
    await expect(store.sendMessage(request.id, 'd-1', '   ')).rejects.toThrow(ChatValidationError);
    await expect(
      store.sendMessage(request.id, 'd-1', 'a'.repeat(CHAT_MESSAGE_MAX_LENGTH + 1)),
    ).rejects.toThrow(ChatValidationError);
    expect((await store.sendMessage(request.id, 'd-1', '  확인했습니다  ')).content).toBe(
      '확인했습니다',
    );
  });

  it('취소된 요청은 발신 불가, 조회는 가능 (분쟁 대응 기록)', async () => {
    const { requestStore, store, request } = await setup();
    await store.sendMessage(request.id, 'd-1', '취소 관련 문의');
    await requestStore.changeStatus(request.id, 'CANCELLED', { cancelReason: '일정 변경' });

    await expect(store.sendMessage(request.id, 'p-1', '답장')).rejects.toThrow(
      '취소된 요청에는 메시지를 보낼 수 없습니다.',
    );
    expect(await store.listMessages(request.id, 'p-1')).toHaveLength(1);
  });

  it('since 이후 메시지만 폴링 조회', async () => {
    const { store, request } = await setup();
    const first = await store.sendMessage(request.id, 'd-1', '첫 메시지');
    await store.sendMessage(request.id, 'p-1', '둘째 메시지');

    const newer = await store.listMessages(request.id, 'd-1', first.createdAt);
    expect(newer.map((m) => m.content)).toEqual(['둘째 메시지']);
  });
});
