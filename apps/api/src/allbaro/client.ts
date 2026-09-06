import {
  isValidBusinessNumber,
  maskBusinessNumber,
  normalizeBusinessNumber,
  type AllbaroManifestStatus,
  type AllbaroMemberVerification,
  type AllbaroNoticeItem,
  type AllbaroRoleType,
  type DisposalInfoRequest,
  type ManifestIssueRequest,
  type TransportInfoRequest,
  type TreatmentCompletionRequest,
} from '@dimol/shared';
import { env } from '../config/env.js';
import { ALLBARO_SPEC, type AllbaroApiSpec } from './spec.js';

/**
 * 올바로 Open API 클라이언트 (개발 가이드 v1.9.1 기준)
 *
 * URL 형식:
 *   GET(조회): POST {baseUrl}/select{interfaceId}
 *   PUT(입력): POST {baseUrl}/insert{interfaceId}
 *
 * 인증: Authorization: Basic base64(userId:password)
 *
 * ⚠️ 운영 호출은 ALLBARO_ALLOW_PRODUCTION=true 로 명시해야만 가능.
 */

export type AllbaroErrorCode =
  | 'INVALID_BUSINESS_NUMBER' // 형식/체크섬 불량 — API 호출 전 차단
  | 'CONFIG_MISSING'          // baseUrl/apiCertKey/userId/password 미설정
  | 'PRODUCTION_BLOCKED'      // 샌드박스 검증 전 운영 호출 차단
  | 'TIMEOUT'                 // 응답 타임아웃
  | 'UPSTREAM_ERROR';         // 올바로 측 오류/비정상 응답

export function isTransientAllbaroError(code: AllbaroErrorCode): boolean {
  return code === 'TIMEOUT' || code === 'UPSTREAM_ERROR';
}

export class AllbaroError extends Error {
  constructor(
    readonly code: AllbaroErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AllbaroError';
  }
}

export interface AllbaroClientConfig {
  baseUrl?: string;
  apiCertKey?: string;   // ALLBARO_API_CERT_KEY — 업체 발급 인증키 (api_cert_key)
  companyCode?: string;  // ALLBARO_COMPANY_CODE — 업체코드 (entn_lkcd)
  userId?: string;       // ALLBARO_USER_ID — Basic auth 아이디 (테스트: 업체번호)
  password?: string;     // ALLBARO_PASSWORD — Basic auth 비밀번호
  mode: 'sandbox' | 'production';
  allowProduction: boolean;
  timeoutMs: number;
}

export interface ManifestApiResult {
  manifestNo: string;
  environment: 'sandbox' | 'production';
}

export class AllbaroClient {
  constructor(
    private readonly config: AllbaroClientConfig,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly spec: AllbaroApiSpec = ALLBARO_SPEC,
  ) {}

  /**
   * 사업자등록번호로 올바로 회원 여부를 실시간 검증한다.
   * T200_4001_05 (배출자_업체정보조회), T300_4001_05 (운반자), T400_4001_05 (처리자)
   */
  async verifyMember(
    businessNumberInput: string,
    roleType: AllbaroRoleType = 'DISCHARGER',
  ): Promise<AllbaroMemberVerification> {
    const businessNumber = normalizeBusinessNumber(businessNumberInput);

    if (!isValidBusinessNumber(businessNumber)) {
      throw new AllbaroError(
        'INVALID_BUSINESS_NUMBER',
        '사업자등록번호 형식/체크섬이 올바르지 않습니다.',
      );
    }

    let interfaceId = this.spec.memberVerifyInterfaceId;
    if (roleType === 'TRANSPORT') interfaceId = this.spec.transportVerifyInterfaceId;
    if (roleType === 'DISPOSAL') interfaceId = this.spec.disposalVerifyInterfaceId;

    const data = await this.callApi(
      'select',
      interfaceId,
      this.spec.buildMemberVerifyBody(businessNumber, roleType),
      maskBusinessNumber(businessNumber),
    );

    return {
      businessNumber,
      verified: this.spec.parseMemberVerified(data),
      memberName: this.spec.parseMemberName(data),
      memberType: this.spec.parseMemberType(
        this.spec.extractMemberType(data),
      ),
      environment: this.config.mode,
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * 올바로 전자인계서를 자동 생성·전송한다.
   * T200_5001_01 (배출자_인계서정보수집/결과회신) — PUT /insertT200_5001_01
   */
  async issueManifest(request: ManifestIssueRequest): Promise<ManifestApiResult> {
    const data = await this.callApi(
      'insert',
      this.spec.manifestIssueInterfaceId,
      this.spec.buildManifestBody(request),
      `match=${request.matchRequestId}`,
    );

    const manifestNo = this.spec.parseManifestNo(data);
    if (manifestNo === undefined) {
      throw new AllbaroError('UPSTREAM_ERROR', '올바로가 전자인계서 번호를 반환하지 않았습니다.');
    }

    return { manifestNo, environment: this.config.mode };
  }

  /**
   * 운반자 인수/차량 정보 등록 (T300_5001_01)
   */
  async registerTransportInfo(request: TransportInfoRequest): Promise<{ success: boolean }> {
    await this.callApi(
      'insert',
      this.spec.transportInfoInterfaceId,
      this.spec.buildTransportInfoBody(request),
      `transport-manifest=${request.manifestNo}`,
    );
    return { success: true };
  }

  /**
   * 처리자 반입/계량 정보 등록 (T400_5001_01)
   */
  async registerDisposalInfo(request: DisposalInfoRequest): Promise<{ success: boolean }> {
    await this.callApi(
      'insert',
      this.spec.disposalInfoInterfaceId,
      this.spec.buildDisposalInfoBody(request),
      `disposal-manifest=${request.manifestNo}`,
    );
    return { success: true };
  }

  /**
   * 처리자 최종 처리완료 정보 등록 (T400_5001_02)
   */
  async registerTreatmentCompletion(request: TreatmentCompletionRequest): Promise<{ success: boolean }> {
    await this.callApi(
      'insert',
      this.spec.treatmentCompletionInterfaceId,
      this.spec.buildTreatmentCompletionBody(request),
      `complete-manifest=${request.manifestNo}`,
    );
    return { success: true };
  }

  /**
   * 인계서 상태/상세 조회 (T200_4001_01)
   */
  async getManifestStatus(manifestNo: string): Promise<AllbaroManifestStatus> {
    const data = await this.callApi(
      'select',
      this.spec.manifestStatusInterfaceId,
      this.spec.buildManifestStatusBody(manifestNo),
      `status-manifest=${manifestNo}`,
    );
    const status = this.spec.parseManifestStatus(data, manifestNo);
    if (!status) {
      throw new AllbaroError('UPSTREAM_ERROR', '해당 인계번호의 상태를 찾을 수 없습니다.');
    }
    return status;
  }

  /**
   * 공지사항 조회 (T100_1001_01)
   */
  async getNotices(): Promise<AllbaroNoticeItem[]> {
    const data = await this.callApi('select', this.spec.noticesInterfaceId, {}, 'notices');
    return this.spec.parseNotices(data);
  }

  /**
   * 공통코드 조회 — T100_3001_02. 연결 테스트 및 폐기물 코드 캐시에 사용.
   * GET /selectT100_3001_02
   */
  async getCommonCodes(): Promise<Record<string, unknown>[]> {
    const data = await this.callApi('select', 'T100_3001_02', {}, 'common-codes');
    return Array.isArray(data.dataList) ? (data.dataList as Record<string, unknown>[]) : [];
  }


  /**
   * 올바로 API 공통 호출 메서드.
   *
   * URL: {baseUrl}/select{interfaceId} 또는 {baseUrl}/insert{interfaceId}
   * Body: api_cert_key + entn_lkcd + additionalBody (자동 합성)
   * Response: resultCode '0000' = 정상, 그 외 = UPSTREAM_ERROR
   */
  async callApi(
    verb: 'select' | 'insert',
    interfaceId: string,
    additionalBody: Record<string, unknown>,
    logKey: string,
  ): Promise<Record<string, unknown>> {
    if (this.config.mode === 'production' && !this.config.allowProduction) {
      throw new AllbaroError(
        'PRODUCTION_BLOCKED',
        '운영(production) 올바로 호출이 차단되었습니다. 샌드박스 검증 완료 후 ALLBARO_ALLOW_PRODUCTION=true 로 전환하세요.',
      );
    }

    if (
      !this.config.baseUrl ||
      !this.config.apiCertKey ||
      !this.config.userId ||
      !this.config.password
    ) {
      throw new AllbaroError(
        'CONFIG_MISSING',
        '올바로 API 설정(ALLBARO_API_BASE_URL / ALLBARO_API_CERT_KEY / ALLBARO_USER_ID / ALLBARO_PASSWORD)이 없습니다.',
      );
    }

    const url = `${this.config.baseUrl}/${verb}${interfaceId}`;
    const basicToken = Buffer.from(
      `${this.config.userId}:${this.config.password}`,
    ).toString('base64');

    const companyCode = this.config.companyCode ?? this.config.userId;
    const body: Record<string, unknown> = {
      api_cert_key: this.config.apiCertKey,
      entn_lkcd: companyCode,
      enrn_licst: companyCode,
      ...additionalBody,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
          Authorization: `Basic ${basicToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.warn(`[allbaro] ${verb}${interfaceId} timeout (${logKey})`);
        throw new AllbaroError('TIMEOUT', '올바로 응답이 시간 내 도착하지 않았습니다.');
      }
      console.warn(`[allbaro] ${verb}${interfaceId} network error (${logKey})`);
      throw new AllbaroError('UPSTREAM_ERROR', '올바로 API 호출에 실패했습니다.');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      console.warn(`[allbaro] ${verb}${interfaceId} HTTP ${response.status} (${logKey})`);
      throw new AllbaroError('UPSTREAM_ERROR', `올바로 API HTTP 오류(status=${response.status}).`);
    }

    const result = (await response.json()) as Record<string, unknown>;

    const resultCode = typeof result.resultCode === 'string' ? result.resultCode : undefined;
    if (resultCode !== undefined && resultCode !== '0000') {
      console.warn(
        `[allbaro] ${verb}${interfaceId} resultCode=${resultCode} msg=${String(result.resultMessage)} (${logKey})`,
      );
      throw new AllbaroError(
        'UPSTREAM_ERROR',
        `올바로 오류(${resultCode}): ${String(result.resultMessage ?? result.errorMessage ?? '알 수 없는 오류')}`,
      );
    }

    return result;
  }
}

export function createAllbaroClient(fetchFn: typeof fetch = fetch): AllbaroClient {
  return new AllbaroClient(
    {
      baseUrl: env.allbaro.baseUrl,
      apiCertKey: env.allbaro.apiCertKey,
      companyCode: env.allbaro.companyCode,
      userId: env.allbaro.userId,
      password: env.allbaro.password,
      mode: env.allbaro.mode,
      allowProduction: env.allbaro.allowProduction,
      timeoutMs: env.allbaro.timeoutMs,
    },
    fetchFn,
  );
}
