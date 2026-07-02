import type { UserRole } from './types.js';

/**
 * 회원 프로필 (배출자 / 철거·운반·처리 업체 · 로드맵 Phase 1 §4.1).
 * phone·businessNumber 는 PII — 로그에 평문으로 남기지 않는다 (CLAUDE.md 절대 규칙).
 */

/** 업체 승인 상태. 배출자는 가입 즉시 APPROVED, 업체는 관리자 승인(Phase 5) 대상. */
export type UserApprovalStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED';

export const USER_APPROVAL_LABELS: Record<UserApprovalStatus, string> = {
  PENDING: '승인 대기',
  APPROVED: '승인됨',
  SUSPENDED: '이용 정지',
};

/** 업체 역할(철거/운반/처리) — 사업자등록번호 필수, 승인 절차 대상. */
export const COMPANY_ROLES: readonly UserRole[] = ['DEMOLITION', 'TRANSPORT', 'DISPOSAL'];

export function isCompanyRole(role: UserRole): boolean {
  return COMPANY_ROLES.includes(role);
}

export interface UserProfile {
  id: string;
  role: UserRole;
  /** 업체 상호 또는 배출자 이름. */
  name: string;
  /** 활동 지역. 파일럿에서는 양평. */
  region: string;
  /** 연락처 (PII — 로그 평문 금지). */
  phone?: string;
  /** 사업자등록번호, 정규화 10자리 (PII — 로그 평문 금지). 업체 필수. */
  businessNumber?: string;
  approvalStatus: UserApprovalStatus;
  /**
   * [올바로 인증 업체] 배지 (우대사항 · 선택 입력).
   * 올바로 회원 검증 API 성공 시 true — 검증 연동 자체는 민감 영역(사람 검토 대상).
   */
  allbaroCertified: boolean;
  /** 올바로 검증 시각(ISO 8601, 인증 시). */
  allbaroCheckedAt?: string;
  /** 보험 가입 확인 (Phase 2 인증 고도화). */
  insuranceRegistered: boolean;
  /** 폐기물처리업 허가증 등록 확인 (Phase 2 인증 고도화). */
  permitRegistered: boolean;
  createdAt: string;
  updatedAt: string;
}
