import {
  isValidBusinessNumber,
  maskBusinessNumber,
  normalizeBusinessNumber,
  type AllbaroMemberVerification,
  type ManifestIssueRequest,
} from '@dimol/shared';
import { env } from '../config/env.js';
import { ASSUMED_ALLBARO_SPEC, type AllbaroApiSpec } from './spec.js';

/**
 * 올바로 API 클라이언트 — 회원 검증(사업자등록번호) + 전자인계서 자동 발행/전송.
 *
 * ⚠️ CLAUDE.md「사람이 반드시 직접 diff를 검토해야 하는 영역」— 올바로 API 연동
 *   (회원 검증 / 전자인계서 발행). 자동 커밋/머지 금지. 사람이 diff 검토 + 올바로
 *   샌드박스 계정으로 검증 후 반영한다.
 * ⚠️ 운영 키로 먼저 테스트하지 않는다. 기본 모드는 sandbox이며, production 호출은
 *   ALLBARO_ALLOW_PRODUCTION=true 를 명시해야만 가능하다.
 * ⚠️ 엔드포인트/요청·응답 필드명은 실제 올바로 API 규격에 맞춰 확정해야 한다.
 *   아래 경로·매핑은 연동 규격 수령 전 임시 가정이다.
 */

export type AllbaroErrorCode =
  | 'INVALID_BUSINESS_NUMBER' // 형식/체크섬 불량 — API 호출 전 차단
  | 'CONFIG_MISSING' // baseUrl/apiKey 미설정
  | 'PRODUCTION_BLOCKED' // 샌드박스 검증 전 운영 호출 차단
  | 'TIMEOUT' // 응답 타임아웃
  | 'UPSTREAM_ERROR'; // 올바로 측 오류/비정상 응답

/** 재시도 큐에 넣을 가치가 있는(일시적) 장애인지 — TIMEOUT/UPSTREAM만 재시도 대상. */
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
  apiKey?: string;
  mode: 'sandbox' | 'production';
  allowProduction: boolean;
  timeoutMs: number;
}

/** 올바로 전자인계서 발행 결과(외부 응답을 정규화). */
export interface ManifestApiResult {
  manifestNo: string;
  environment: 'sandbox' | 'production';
}

export class AllbaroClient {
  constructor(
    private readonly config: AllbaroClientConfig,
    /** 테스트에서 주입 가능. 기본은 전역 fetch. */
    private readonly fetchFn: typeof fetch = fetch,
    /** 올바로 API 규격 어댑터. 실제 규격 수령 시 이 객체만 교체한다. */
    private readonly spec: AllbaroApiSpec = ASSUMED_ALLBARO_SPEC,
  ) {}

  /**
   * 사업자등록번호로 올바로 회원 여부를 실시간 검증한다.
   * 형식/체크섬은 호출 전에 차단하고, PII(사업자번호 평문)는 로그에 남기지 않는다.
   */
  async verifyMember(businessNumberInput: string): Promise<AllbaroMemberVerification> {
    const businessNumber = normalizeBusinessNumber(businessNumberInput);

    if (!isValidBusinessNumber(businessNumber)) {
      throw new AllbaroError(
        'INVALID_BUSINESS_NUMBER',
        '사업자등록번호 형식/체크섬이 올바르지 않습니다.',
      );
    }

    const data = await this.post(
      this.spec.memberVerifyPath,
      this.spec.buildMemberVerifyBody(businessNumber),
      maskBusinessNumber(businessNumber),
    );

    return {
      businessNumber,
      verified: this.spec.parseMemberVerified(data),
      memberName: this.spec.parseMemberName(data),
      memberType: this.spec.parseMemberType(data.memberType),
      environment: this.config.mode,
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * 올바로 전자인계서를 자동 생성·전송한다. 성공 시 인계서 관리번호를 반환.
   * 실패 시 AllbaroError를 던지며, 폴백/재시도 판단은 상위 서비스가 담당한다.
   * 사업자번호(PII)는 로그에 마스킹 값만 남긴다.
   */
  async issueManifest(request: ManifestIssueRequest): Promise<ManifestApiResult> {
    const data = await this.post(
      this.spec.manifestIssuePath,
      this.spec.buildManifestBody(request),
      `match=${request.matchRequestId}`,
    );

    const manifestNo = this.spec.parseManifestNo(data);
    if (manifestNo === undefined) {
      throw new AllbaroError('UPSTREAM_ERROR', '올바로가 전자인계서 번호를 반환하지 않았습니다.');
    }

    return { manifestNo, environment: this.config.mode };
  }

  /** 공통 POST: 샌드박스/설정 가드 + 타임아웃 + 업스트림 오류 매핑. */
  private async post(
    path: string,
    body: unknown,
    logKey: string,
  ): Promise<Record<string, unknown>> {
    if (this.config.mode === 'production' && !this.config.allowProduction) {
      throw new AllbaroError(
        'PRODUCTION_BLOCKED',
        '운영(production) 올바로 호출이 차단되었습니다. 샌드박스 검증 완료 후 ALLBARO_ALLOW_PRODUCTION=true 로 전환하세요.',
      );
    }

    if (!this.config.baseUrl || !this.config.apiKey) {
      throw new AllbaroError(
        'CONFIG_MISSING',
        '올바로 API 설정(ALLBARO_API_BASE_URL/ALLBARO_API_KEY)이 없습니다. apps/api/.env 를 확인하세요.',
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(`${this.config.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      // 로그에 PII 평문 금지 — 마스킹/식별키만 남긴다.
      if (err instanceof Error && err.name === 'AbortError') {
        console.warn(`[allbaro] POST ${path} timeout (${logKey})`);
        throw new AllbaroError('TIMEOUT', '올바로 응답이 시간 내 도착하지 않았습니다.');
      }
      console.warn(`[allbaro] POST ${path} network error (${logKey})`);
      throw new AllbaroError('UPSTREAM_ERROR', '올바로 API 호출에 실패했습니다.');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      console.warn(`[allbaro] POST ${path} upstream ${response.status} (${logKey})`);
      throw new AllbaroError('UPSTREAM_ERROR', `올바로 API 오류(status=${response.status}).`);
    }

    return (await response.json()) as Record<string, unknown>;
  }
}

/** 환경변수 기반 기본 클라이언트 팩토리. */
export function createAllbaroClient(fetchFn: typeof fetch = fetch): AllbaroClient {
  return new AllbaroClient(
    {
      baseUrl: env.allbaro.baseUrl,
      apiKey: env.allbaro.apiKey,
      mode: env.allbaro.mode,
      allowProduction: env.allbaro.allowProduction,
      timeoutMs: env.allbaro.timeoutMs,
    },
    fetchFn,
  );
}
