import {
  normalizeBusinessNumber,
  type AllbaroMemberType,
  type AllbaroManifestStatus,
  type AllbaroNoticeItem,
  type AllbaroRoleType,
  type DisposalInfoRequest,
  type ManifestIssueRequest,
  type TransportInfoRequest,
  type TreatmentCompletionRequest,
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
  /** T300_4001_05: 운반자_업체정보조회/회신 */
  transportVerifyInterfaceId: string;
  /** T400_4001_05: 처리자_업체정보조회/회신 */
  disposalVerifyInterfaceId: string;

  /** T200_5001_01: 배출자_인계서정보수집/결과회신 */
  manifestIssueInterfaceId: string;

  /** T300_5001_01: 운반자_인수정보수집/등록 */
  transportInfoInterfaceId: string;

  /** T400_5001_01: 처리자_반입계량정보등록 */
  disposalInfoInterfaceId: string;

  /** T400_5001_02: 처리자_최종처리완료등록 */
  treatmentCompletionInterfaceId: string;

  /** T200_4001_01: 배출자_인계서상태조회 */
  manifestStatusInterfaceId: string;

  /** T100_1001_01: 공지사항조회 */
  noticesInterfaceId: string;

  buildMemberVerifyBody(businessNumber: string, roleType?: AllbaroRoleType): Record<string, unknown>;
  parseMemberVerified(data: Record<string, unknown>): boolean;
  parseMemberName(data: Record<string, unknown>): string | undefined;
  extractMemberType(data: Record<string, unknown>): unknown;
  parseMemberType(raw: unknown): AllbaroMemberType;

  buildManifestBody(request: ManifestIssueRequest): Record<string, unknown>;
  parseManifestNo(data: Record<string, unknown>): string | undefined;

  buildTransportInfoBody(request: TransportInfoRequest): Record<string, unknown>;
  buildDisposalInfoBody(request: DisposalInfoRequest): Record<string, unknown>;
  buildTreatmentCompletionBody(request: TreatmentCompletionRequest): Record<string, unknown>;

  buildManifestStatusBody(manifestNo: string): Record<string, unknown>;
  parseManifestStatus(data: Record<string, unknown>, manifestNo: string): AllbaroManifestStatus | undefined;

  parseNotices(data: Record<string, unknown>): AllbaroNoticeItem[];
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
 */
export const ALLBARO_SPEC: AllbaroApiSpec = {
  memberVerifyInterfaceId: 'T200_4001_05',
  transportVerifyInterfaceId: 'T300_4001_05',
  disposalVerifyInterfaceId: 'T400_4001_05',
  manifestIssueInterfaceId: 'T200_5001_01',
  transportInfoInterfaceId: 'T300_5001_01',
  disposalInfoInterfaceId: 'T400_5001_01',
  treatmentCompletionInterfaceId: 'T400_5001_02',
  manifestStatusInterfaceId: 'T200_4001_01',
  noticesInterfaceId: 'T100_1001_01',

  buildMemberVerifyBody: (_businessNumber) => ({
    // 업체 정보 조회 — 전체 조회 후 사업자번호로 필터링
    req_type: 'A',
    page_no: '1',
    subcd_include_yn: 'N',
    manf_nums: null,
    period_from_date: null,
    period_to_date: null,
  }),

  parseMemberVerified: (data) => {
    const dataList = data.dataList;
    return Array.isArray(dataList) && dataList.length > 0;
  },

  parseMemberName: (data) => {
    const dataList = data.dataList;
    if (!Array.isArray(dataList) || dataList.length === 0) return undefined;
    const first = dataList[0] as Record<string, unknown>;
    const name = first.firm_name ?? first.entn_nm ?? first.memberName;
    return typeof name === 'string' ? name : undefined;
  },

  extractMemberType: (data) => {
    const dataList = data.dataList;
    if (!Array.isArray(dataList) || dataList.length === 0) return undefined;
    const first = dataList[0] as Record<string, unknown>;
    return first.entn_type ?? first.memberType;
  },

  parseMemberType: mapMemberType,

  buildManifestBody: (request) => ({
    PutData: {
      DSCD: normalizeBusinessNumber(request.discharger.businessNumber),
      TRPR: normalizeBusinessNumber(request.transport.businessNumber),
      RPPR: normalizeBusinessNumber(request.disposal.businessNumber),
      WSTE_TONS: String(request.wasteTons),
      WSTE_CLSF_CD: request.wasteCategory === 'CONSTRUCTION' ? '02' : '01',
    },
  }),

  parseManifestNo: (data) => {
    const dataList = data.dataList;
    if (!Array.isArray(dataList) || dataList.length === 0) return undefined;
    const first = dataList[0] as Record<string, unknown>;
    const no = first.manf_num ?? first.manifest_no ?? first.manifestNo;
    return typeof no === 'string' && no !== '' ? no : undefined;
  },

  buildTransportInfoBody: (request) => ({
    PutData: {
      MANF_NUM: request.manifestNo,
      VHCL_NO: request.vehicleNo,
      TRNS_TONS: String(request.transportedTons),
      PICKUP_AT: request.pickupAt,
    },
  }),

  buildDisposalInfoBody: (request) => ({
    PutData: {
      MANF_NUM: request.manifestNo,
      WEIGHED_TONS: String(request.weighedTons),
      RECEIVED_AT: request.receivedAt,
    },
  }),

  buildTreatmentCompletionBody: (request) => ({
    PutData: {
      MANF_NUM: request.manifestNo,
      COMPLETED_AT: request.completedAt,
      TRTM_MTHD_CD: request.treatmentMethodCode ?? '01',
    },
  }),

  buildManifestStatusBody: (manifestNo) => ({
    manf_nums: manifestNo,
    req_type: 'A',
    page_no: '1',
  }),

  parseManifestStatus: (data, manifestNo) => {
    const dataList = data.dataList;
    if (!Array.isArray(dataList) || dataList.length === 0) return undefined;
    const item = dataList[0] as Record<string, unknown>;
    return {
      manifestNo: (item.manf_num as string) ?? manifestNo,
      status: (item.status as string) ?? (data.resultMessage as string) ?? 'ISSUED',
      dischargerName: typeof item.dscd_nm === 'string' ? item.dscd_nm : undefined,
      transportName: typeof item.trpr_nm === 'string' ? item.trpr_nm : undefined,
      disposalName: typeof item.rppr_nm === 'string' ? item.rppr_nm : undefined,
      wasteTons: typeof item.wste_tons === 'number' ? item.wste_tons : undefined,
      issuedAt: typeof item.issued_at === 'string' ? item.issued_at : undefined,
      updatedAt: typeof item.updated_at === 'string' ? item.updated_at : undefined,
    };
  },

  parseNotices: (data) => {
    const dataList = data.dataList;
    if (!Array.isArray(dataList)) return [];
    return dataList.map((item, idx) => {
      const it = item as Record<string, unknown>;
      return {
        id: String(it.notice_id ?? it.id ?? `N-${idx + 1}`),
        title: String(it.title ?? it.subject ?? '올바로 공지사항'),
        createdAt: String(it.created_at ?? it.reg_dt ?? new Date().toISOString()),
        content: typeof it.content === 'string' ? it.content : undefined,
      };
    });
  },
};

