import { randomUUID } from 'node:crypto';
import {
  PILOT,
  isCompanyRole,
  isValidBusinessNumber,
  normalizeBusinessNumber,
  type UserApprovalStatus,
  type UserProfile,
  type UserRole,
} from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';

/**
 * 회원 프로필 저장소 (로드맵 Phase 1 §4.1 온보딩).
 * 배출자는 가입 즉시 승인, 업체(철거/운반/처리)는 PENDING → 관리자 승인(Phase 5 백오피스).
 * phone·businessNumber 는 PII — 오류 메시지·로그에 값을 노출하지 않는다.
 */

export class UserValidationError extends Error {}

const USER_ROLES: readonly UserRole[] = ['DISCHARGER', 'DEMOLITION', 'TRANSPORT', 'DISPOSAL'];

export interface CreateUserInput {
  role: UserRole;
  name: string;
  region: string;
  phone?: string;
  /** 업체 필수. 하이픈 포함 입력 허용, 정규화해 저장. */
  businessNumber?: string;
}

export interface UpdateUserInput {
  name?: string;
  region?: string;
  phone?: string;
}

export interface ListUsersFilter {
  role?: UserRole;
  approvalStatus?: UserApprovalStatus;
}

export class UserStore {
  private readonly users = new Map<string, UserProfile>();

  constructor(private readonly persistence?: CollectionPersistence<UserProfile>) {
    for (const user of persistence?.load() ?? []) {
      this.users.set(user.id, user);
    }
  }

  private persist(): void {
    this.persistence?.save([...this.users.values()]);
  }

  create(input: CreateUserInput): UserProfile {
    if (!USER_ROLES.includes(input.role)) {
      throw new UserValidationError(`role 은 ${USER_ROLES.join(' | ')} 중 하나여야 합니다.`);
    }
    if (typeof input.name !== 'string' || input.name.trim().length === 0) {
      throw new UserValidationError('name(상호/이름)이 필요합니다.');
    }
    if (input.region !== PILOT.region) {
      throw new UserValidationError(`파일럿 기간에는 ${PILOT.region} 지역만 가입할 수 있습니다.`);
    }

    let businessNumber: string | undefined;
    if (isCompanyRole(input.role)) {
      if (!input.businessNumber || !isValidBusinessNumber(input.businessNumber)) {
        // PII — 입력값을 메시지에 되돌려주지 않는다.
        throw new UserValidationError('유효한 사업자등록번호(10자리)가 필요합니다.');
      }
      businessNumber = normalizeBusinessNumber(input.businessNumber);
      const duplicate = [...this.users.values()].some((u) => u.businessNumber === businessNumber);
      if (duplicate) {
        throw new UserValidationError('이미 가입된 사업자등록번호입니다.');
      }
    }

    const now = new Date().toISOString();
    const user: UserProfile = {
      id: randomUUID(),
      role: input.role,
      name: input.name.trim(),
      region: input.region,
      ...(input.phone ? { phone: input.phone.trim() } : {}),
      ...(businessNumber ? { businessNumber } : {}),
      // 배출자는 즉시 이용 가능, 업체는 관리자 승인 후 매칭 노출.
      approvalStatus: isCompanyRole(input.role) ? 'PENDING' : 'APPROVED',
      allbaroCertified: false,
      insuranceRegistered: false,
      permitRegistered: false,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    this.persist();
    return user;
  }

  get(id: string): UserProfile | undefined {
    return this.users.get(id);
  }

  list(filter: ListUsersFilter = {}): UserProfile[] {
    return [...this.users.values()]
      .filter(
        (u) =>
          (filter.role === undefined || u.role === filter.role) &&
          (filter.approvalStatus === undefined || u.approvalStatus === filter.approvalStatus),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  update(id: string, input: UpdateUserInput): UserProfile {
    const user = this.requireUser(id);
    if (input.region !== undefined && input.region !== PILOT.region) {
      throw new UserValidationError(`파일럿 기간에는 ${PILOT.region} 지역만 지원합니다.`);
    }
    const updated: UserProfile = {
      ...user,
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      ...(input.region ? { region: input.region } : {}),
      ...(input.phone !== undefined ? { phone: input.phone.trim() || undefined } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.users.set(id, updated);
    this.persist();
    return updated;
  }

  /** 관리자 승인/정지 (Phase 5 백오피스에서 사용). */
  setApprovalStatus(id: string, status: UserApprovalStatus): UserProfile {
    const user = this.requireUser(id);
    const updated: UserProfile = { ...user, approvalStatus: status, updatedAt: new Date().toISOString() };
    this.users.set(id, updated);
    this.persist();
    return updated;
  }

  /**
   * [올바로 인증 업체] 배지 갱신.
   * 올바로 회원 검증 라우트(민감 영역, 사람 검토 대상)가 검증 성공 시 호출한다.
   */
  setAllbaroCertified(id: string, certified: boolean, checkedAt: string): UserProfile {
    const user = this.requireUser(id);
    const updated: UserProfile = {
      ...user,
      allbaroCertified: certified,
      allbaroCheckedAt: checkedAt,
      updatedAt: new Date().toISOString(),
    };
    this.users.set(id, updated);
    this.persist();
    return updated;
  }

  /** 인증 서류 등록 상태 갱신 (Phase 2 인증 고도화). */
  setCertifications(
    id: string,
    input: { insuranceRegistered?: boolean; permitRegistered?: boolean },
  ): UserProfile {
    const user = this.requireUser(id);
    if (!isCompanyRole(user.role)) {
      throw new UserValidationError('인증 서류 등록은 업체 회원만 가능합니다.');
    }
    const updated: UserProfile = {
      ...user,
      ...(input.insuranceRegistered !== undefined
        ? { insuranceRegistered: input.insuranceRegistered }
        : {}),
      ...(input.permitRegistered !== undefined
        ? { permitRegistered: input.permitRegistered }
        : {}),
      updatedAt: new Date().toISOString(),
    };
    this.users.set(id, updated);
    this.persist();
    return updated;
  }

  private requireUser(id: string): UserProfile {
    const user = this.users.get(id);
    if (!user) throw new UserValidationError('회원을 찾을 수 없습니다.');
    return user;
  }
}
