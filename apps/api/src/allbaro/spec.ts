import {
  normalizeBusinessNumber,
  type AllbaroMemberType,
  type ManifestIssueRequest,
} from '@dimol/shared';

/**
 * 올바로 Open API 규격 어댑터 (개발 가이드 v1.9.1 / 인터페이스 정의서 v1.9.5 기준)
 *
 * 인터페이스 ID 체계:
 *   T100_xxxx: 공통 (공지사항, 공통코드)
 *   T200_xxxx: 배출자
 *   T300_xxxx: 운반자
 *   T400_xxxx: 처리자
 *
 * URL: {baseUrl}/select{ifId} (GET조회) / {baseUrl}/insert{ifId} (PUT입력)
 */
export interface AllbaroApiSpec {
  /** T200_4001_05: 배출자_업체정보조회/회신 */
  memberVerifyInterfaceId: string;
  /** T200_5001_01: 배출자_인계서정보수집/결과회신 */
  manifestIssueInterfaceId: string;
  buildMemberVerifyBody(businessNumber: string): Record<string, unknown>;
  parseMemberVerified(data: Record<string, unknown>): boolean;
  parseMemberName(data: Record<string, unknown>): string | undefined;
  extractMemberType(data: Record<string, unknown>): unknown;
  parseMemberType(raw: unknown): AllbaroMemberType;
  buildManifestBody(request: ManifestIssueRequest): Record<string, unknown>;
  parseManifestNo(data: Record<string, unknown>): string | undefined;
}

/**
 * 업체 구분 코드 → 도메인 타입.
 * EMIS=배출자, TRAN=운반자, TRTM=처리자 (가이드 테스트케이스 표 4.3 기준)
 */
function mapMemberType(raw: unknown): AllbaroMemberType {
  switch (raw) {
    case 'EMIS':
    case 'DISCHARGER':
    case '01':
      return 'DISCHARGER';
    case 'TRAN':
    case 'TRANSPORT':
    case '02':
      return 'TRANSPORT';
    case 'TRTM':
    case 'DISPOSAL':
    case '03':
      return 'DISPOSAL';
    default:
      return 'UNKNOWN';
  }
}

/**
 * 올바로 Open API v1.9.1 실제 규격 스펙.
 *
 * GET 요청 Body (인계서 연계 — T200_4001_XX):
 *   api_cert_key, entn_lkcd (클라이언트가 자동 주입)
 *   + manf_nums, req_type, page_no, period_from_date, period_to_date, subcd_include_yn
 *
 * PUT 요청 Body (인계서 수집 — T200_5001_01):
 *   api_cert_key, entn_lkcd (클라이언트가 자동 주입)
 *   + PutData (인터페이스 정의서 v1.9.5 참조)
 *
 * Response:
 *   { ifid, txid, resultCode, resultMessage, errorMessage, totalPageNo, dataList[] }
 *   resultCode '0000' = 정상
 */
export const ALLBARO_SPEC: AllbaroApiSpec = {
  memberVerifyInterfaceId: 'T200_4001_05',
  manifestIssueInterfaceId: 'T200_5001_01',

  buildMemberVerifyBody: (_businessNumber) => ({
    // 업체 정보 조회 — 전체 조회 후 사업자번호로 필터링
    req_type: 'A',
    page_no: 'N',
    subcd_include_yn: 'N',
    manf_nums: null,
    period_from_date: null,
    period_to_date: null,
  }),

  parseMemberVerified: (data) => {
    // resultCode 체크는 callApi에서 이미 수행 — 여기서는 dataList 존재 여부 확인
    const dataList = data.dataList;
    return Array.isArray(dataList) && dataList.length > 0;
  },

  parseMemberName: (data) => {
    const dataList = data.dataList;
    if (!Array.isArray(dataList) || dataList.length === 0) return undefined;
    const first = dataList[0] as Record<string, unknown>;
    // 업체명 필드 (정의서 v1.9.5 확인 필요 — firm_name 또는 entn_nm)
    const name = first.firm_name ?? first.entn_nm ?? first.memberName;
    return typeof name === 'string' ? name : undefined;
  },

  extractMemberType: (data) => {
    const dataList = data.dataList;
    if (!Array.isArray(dataList) || dataList.length === 0) return undefined;
    const first = dataList[0] as Record<string, unknown>;
    // 업체 구분 코드 (EMIS/TRAN/TRTM or memberType)
    return first.entn_type ?? first.memberType;
  },

  parseMemberType: mapMemberType,

  buildManifestBody: (request) => ({
    // PutData 상세 필드는 인터페이스 정의서 v1.9.5 T200_5001_01 참조
    // 아래는 필수 필드 기본 구조 — 운영 전 정의서 대조 필수
    PutData: {
      DSCD: normalizeBusinessNumber(request.discharger.businessNumber),
      TRPR: normalizeBusinessNumber(request.transport.businessNumber),
      RPPR: normalizeBusinessNumber(request.disposal.businessNumber),
      WSTE_TONS: String(request.wasteTons),
      // 건설폐기물=02, 사업장폐기물=01
      WSTE_CLSF_CD: request.wasteCategory === 'CONSTRUCTION' ? '02' : '01',
    },
  }),

  parseManifestNo: (data) => {
    const dataList = data.dataList;
    if (!Array.isArray(dataList) || dataList.length === 0) return undefined;
    const first = dataList[0] as Record<string, unknown>;
    // 인계번호 필드 (정의서 v1.9.5 확인 필요)
    const no = first.manf_num ?? first.manifest_no ?? first.manifestNo;
    return typeof no === 'string' && no !== '' ? no : undefined;
  },
};
