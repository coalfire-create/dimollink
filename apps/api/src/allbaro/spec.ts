import {
  normalizeBusinessNumber,
  type AllbaroMemberType,
  type ManifestIssueRequest,
} from '@dimol/shared';

/**
 * 올바로 API 규격 어댑터.
 *
 * 엔드포인트 경로·요청 바디·응답 필드·회원유형 코드 등 "실제 규격에 종속되는 부분"을
 * 이 인터페이스 하나로 모은다. 환경부에서 실제 연동 규격을 수령하면 AllbaroApiSpec 을
 * 구현한 객체 하나만 새로 만들어 AllbaroClient 에 주입하면 된다(클라이언트 로직 불변).
 *
 * 기본값 ASSUMED_ALLBARO_SPEC 은 규격 수령 전 임시 가정이며, 운영 전 실제 규격으로 교체한다.
 */
export interface AllbaroApiSpec {
  memberVerifyPath: string;
  manifestIssuePath: string;
  buildMemberVerifyBody(businessNumber: string): Record<string, unknown>;
  parseMemberVerified(data: Record<string, unknown>): boolean;
  parseMemberName(data: Record<string, unknown>): string | undefined;
  parseMemberType(raw: unknown): AllbaroMemberType;
  buildManifestBody(request: ManifestIssueRequest): Record<string, unknown>;
  parseManifestNo(data: Record<string, unknown>): string | undefined;
}

/** 회원유형 코드 → 도메인 타입. 규격 확정 시 코드값을 갱신한다. */
function mapMemberType(raw: unknown): AllbaroMemberType {
  switch (raw) {
    case 'DISCHARGER':
    case '01': // 배출자 (가정값)
      return 'DISCHARGER';
    case 'TRANSPORT':
    case '02': // 운반자 (가정값)
      return 'TRANSPORT';
    case 'DISPOSAL':
    case '03': // 처리자 (가정값)
      return 'DISPOSAL';
    default:
      return 'UNKNOWN';
  }
}

/** 규격 수령 전 임시 가정 스펙. 운영 전 실제 올바로 API 규격으로 교체할 것. */
export const ASSUMED_ALLBARO_SPEC: AllbaroApiSpec = {
  memberVerifyPath: '/member/verify',
  manifestIssuePath: '/manifest/issue',
  buildMemberVerifyBody: (businessNumber) => ({ businessNumber }),
  parseMemberVerified: (data) => data.verified === true || data.isMember === true,
  parseMemberName: (data) => (typeof data.memberName === 'string' ? data.memberName : undefined),
  parseMemberType: mapMemberType,
  buildManifestBody: (request) => ({
    wasteCategory: request.wasteCategory,
    wasteTons: request.wasteTons,
    discharger: { businessNumber: normalizeBusinessNumber(request.discharger.businessNumber) },
    transport: { businessNumber: normalizeBusinessNumber(request.transport.businessNumber) },
    disposal: { businessNumber: normalizeBusinessNumber(request.disposal.businessNumber) },
  }),
  parseManifestNo: (data) => {
    const no = data.manifestNo ?? data.manifestNumber;
    return typeof no === 'string' && no !== '' ? no : undefined;
  },
};
