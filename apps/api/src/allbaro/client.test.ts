import { describe, expect, it, vi } from 'vitest';
import { AllbaroClient, AllbaroError, type AllbaroClientConfig } from './client.js';

const VALID = '220-81-62517';

const sandboxConfig: AllbaroClientConfig = {
  baseUrl: 'https://sandbox.allbaro.example',
  apiCertKey: 'test-cert-key',
  companyCode: '254269674',
  userId: '254269674',
  password: 'allbarosys',
  mode: 'sandbox',
  allowProduction: false,
  timeoutMs: 5_000,
};

// 올바로 API 표준 응답 형식 (resultCode '0000' = 정상)
function allbaroResponse(
  dataList: unknown[],
  resultCode = '0000',
  ok = true,
  status = 200,
): Response {
  return {
    ok,
    status,
    json: async () => ({
      ifid: 'T200_4001_05',
      txid: 'T200_4001_05-20260728-0001',
      resultCode,
      resultMessage: resultCode === '0000' ? '정상' : '오류',
      errorMessage: null,
      totalPageNo: '1',
      dataList,
    }),
  } as unknown as Response;
}

describe('AllbaroClient.verifyMember', () => {
  it('정상 회원 조회 시 verified=true와 업체명을 반환한다', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      allbaroResponse([{ firm_name: '테스트운반', entn_type: 'TRAN' }]),
    );
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    const result = await client.verifyMember(VALID);

    expect(result.verified).toBe(true);
    expect(result.memberName).toBe('테스트운반');
    expect(result.memberType).toBe('TRANSPORT');
    expect(result.environment).toBe('sandbox');
    expect(result.businessNumber).toBe('2208162517');
  });

  it('dataList가 빈 배열이면 verified=false', async () => {
    const fetchFn = vi.fn().mockResolvedValue(allbaroResponse([]));
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    const result = await client.verifyMember(VALID);
    expect(result.verified).toBe(false);
  });

  it('요청 URL이 /selectT200_4001_05 형식이어야 한다', async () => {
    const fetchFn = vi.fn().mockResolvedValue(allbaroResponse([]));
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    await client.verifyMember(VALID);

    const calledUrl = (fetchFn.mock.calls[0][0] as string);
    expect(calledUrl).toBe('https://sandbox.allbaro.example/selectT200_4001_05');
  });

  it('요청 Body에 api_cert_key와 entn_lkcd가 포함되어야 한다', async () => {
    const fetchFn = vi.fn().mockResolvedValue(allbaroResponse([]));
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    await client.verifyMember(VALID);

    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.api_cert_key).toBe('test-cert-key');
    expect(body.entn_lkcd).toBe('254269674');
  });

  it('Authorization 헤더가 Basic 형식이어야 한다', async () => {
    const fetchFn = vi.fn().mockResolvedValue(allbaroResponse([]));
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    await client.verifyMember(VALID);

    const headers = (fetchFn.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toMatch(/^Basic /);
    // base64(254269674:allbarosys)
    const expected = `Basic ${Buffer.from('254269674:allbarosys').toString('base64')}`;
    expect(headers['Authorization']).toBe(expected);
  });

  it('형식/체크섬 불량이면 fetch 호출 없이 INVALID_BUSINESS_NUMBER', async () => {
    const fetchFn = vi.fn();
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    await expect(client.verifyMember('123')).rejects.toMatchObject({
      code: 'INVALID_BUSINESS_NUMBER',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('운영 모드에서 allowProduction=false면 fetch 없이 PRODUCTION_BLOCKED', async () => {
    const fetchFn = vi.fn();
    const client = new AllbaroClient(
      { ...sandboxConfig, mode: 'production', allowProduction: false },
      fetchFn as unknown as typeof fetch,
    );

    await expect(client.verifyMember(VALID)).rejects.toMatchObject({ code: 'PRODUCTION_BLOCKED' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('apiCertKey 미설정이면 CONFIG_MISSING', async () => {
    const fetchFn = vi.fn();
    const client = new AllbaroClient(
      { ...sandboxConfig, apiCertKey: undefined },
      fetchFn as unknown as typeof fetch,
    );

    await expect(client.verifyMember(VALID)).rejects.toMatchObject({ code: 'CONFIG_MISSING' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('userId 미설정이면 CONFIG_MISSING', async () => {
    const fetchFn = vi.fn();
    const client = new AllbaroClient(
      { ...sandboxConfig, userId: undefined },
      fetchFn as unknown as typeof fetch,
    );

    await expect(client.verifyMember(VALID)).rejects.toMatchObject({ code: 'CONFIG_MISSING' });
  });

  it('업스트림 4xx/5xx는 UPSTREAM_ERROR', async () => {
    const fetchFn = vi.fn().mockResolvedValue(allbaroResponse([], '0000', false, 500));
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    await expect(client.verifyMember(VALID)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });

  it('resultCode가 0000이 아니면 UPSTREAM_ERROR', async () => {
    const fetchFn = vi.fn().mockResolvedValue(allbaroResponse([], '9001'));
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    await expect(client.verifyMember(VALID)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });

  it('AbortError(타임아웃)는 TIMEOUT', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    const fetchFn = vi.fn().mockRejectedValue(abortErr);
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    await expect(client.verifyMember(VALID)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('알 수 없는 entn_type은 UNKNOWN으로 매핑', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      allbaroResponse([{ firm_name: '테스트', entn_type: 'ZZZ' }]),
    );
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    const result = await client.verifyMember(VALID);
    expect(result.memberType).toBe('UNKNOWN');
  });

  it('AllbaroError는 Error 인스턴스이고 code를 가진다', () => {
    const e = new AllbaroError('TIMEOUT', 'x');
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('TIMEOUT');
  });
});

describe('AllbaroClient.getCommonCodes', () => {
  it('공통코드 조회는 /selectT100_3001_02로 호출한다', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ifid: 'T100_3001_02',
        txid: 'T100_3001_02-20260728-0001',
        resultCode: '0000',
        resultMessage: '정상',
        dataList: [{ code_type: 'A0', code: '01', code_name: '특정시설 폐기물' }],
      }),
    });
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    const codes = await client.getCommonCodes();

    expect(fetchFn.mock.calls[0][0]).toBe('https://sandbox.allbaro.example/selectT100_3001_02');
    expect(codes).toHaveLength(1);
    expect(codes[0].code_type).toBe('A0');
  });
});

describe('AllbaroClient 역할별 회원 검증 & 신규 기능', () => {
  it('운반자 검증 시 T300_4001_05로 호출한다', async () => {
    const fetchFn = vi.fn().mockResolvedValue(allbaroResponse([{ firm_name: '샘플운반', entn_type: 'TRAN' }]));
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    const res = await client.verifyMember(VALID, 'TRANSPORT');
    expect(fetchFn.mock.calls[0][0]).toBe('https://sandbox.allbaro.example/selectT300_4001_05');
    expect(res.verified).toBe(true);
    expect(res.memberName).toBe('샘플운반');
  });

  it('처리자 검증 시 T400_4001_05로 호출한다', async () => {
    const fetchFn = vi.fn().mockResolvedValue(allbaroResponse([{ firm_name: '샘플처리장', entn_type: 'TRTM' }]));
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    const res = await client.verifyMember(VALID, 'DISPOSAL');
    expect(fetchFn.mock.calls[0][0]).toBe('https://sandbox.allbaro.example/selectT400_4001_05');
    expect(res.verified).toBe(true);
    expect(res.memberName).toBe('샘플처리장');
  });

  it('운반 정보 등록(registerTransportInfo)은 /insertT300_5001_01로 호출한다', async () => {
    const fetchFn = vi.fn().mockResolvedValue(allbaroResponse([]));
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    const res = await client.registerTransportInfo({
      manifestNo: 'M-12345',
      vehicleNo: '서울80바1234',
      transportedTons: 10.5,
      pickupAt: '2026-08-14 10:00',
    });

    expect(fetchFn.mock.calls[0][0]).toBe('https://sandbox.allbaro.example/insertT300_5001_01');
    expect(res.success).toBe(true);
  });

  it('처리자 반입 정보 등록(registerDisposalInfo)은 /insertT400_5001_01로 호출한다', async () => {
    const fetchFn = vi.fn().mockResolvedValue(allbaroResponse([]));
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    const res = await client.registerDisposalInfo({
      manifestNo: 'M-12345',
      weighedTons: 10.2,
      receivedAt: '2026-08-14 11:30',
    });

    expect(fetchFn.mock.calls[0][0]).toBe('https://sandbox.allbaro.example/insertT400_5001_01');
    expect(res.success).toBe(true);
  });

  it('처리자 최종 처리완료 등록(registerTreatmentCompletion)은 /insertT400_5001_02로 호출한다', async () => {
    const fetchFn = vi.fn().mockResolvedValue(allbaroResponse([]));
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    const res = await client.registerTreatmentCompletion({
      manifestNo: 'M-12345',
      completedAt: '2026-08-14 15:00',
    });

    expect(fetchFn.mock.calls[0][0]).toBe('https://sandbox.allbaro.example/insertT400_5001_02');
    expect(res.success).toBe(true);
  });

  it('인계서 상태 조회(getManifestStatus)는 /selectT200_4001_01로 호출한다', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      allbaroResponse([{ manf_num: 'M-12345', status: 'IN_TRANSIT', dscd_nm: '배출업체A' }]),
    );
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    const status = await client.getManifestStatus('M-12345');

    expect(fetchFn.mock.calls[0][0]).toBe('https://sandbox.allbaro.example/selectT200_4001_01');
    expect(status.manifestNo).toBe('M-12345');
    expect(status.status).toBe('IN_TRANSIT');
    expect(status.dischargerName).toBe('배출업체A');
  });

  it('공지사항 조회(getNotices)는 /selectT100_1001_01로 호출한다', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      allbaroResponse([{ notice_id: '101', title: '올바로 점검 안내', created_at: '2026-08-14' }]),
    );
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    const notices = await client.getNotices();

    expect(fetchFn.mock.calls[0][0]).toBe('https://sandbox.allbaro.example/selectT100_1001_01');
    expect(notices).toHaveLength(1);
    expect(notices[0].title).toBe('올바로 점검 안내');
  });
});

