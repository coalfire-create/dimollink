import { randomUUID } from 'node:crypto';
import {
  PILOT,
  USER_TYPES,
  isCompanyType,
  isValidBusinessNumber,
  isValidGeoPoint,
  normalizeBusinessNumber,
  usesCallAvailability,
  type CallAvailability,
  type GeoPoint,
  type SocialIdentity,
  type SocialProvider,
  type UserApprovalStatus,
  type UserProfile,
  type UserType,
} from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';

/**
 * 회원 프로필 저장소 (로드맵 Phase 1 §4.1 온보딩).
 * 소비자는 가입 즉시 승인, 업체(철거/운반/처리)는 PENDING → 관리자 승인(Phase 5 백오피스).
 * phone·businessNumber 는 PII — 오류 메시지·로그에 값을 노출하지 않는다.
 */

export class UserValidationError extends Error {}

/**
 * 레거시 role(계정 4역할) → 신규 user_type 매핑.
 * 기존에 저장된 users.json 레코드를 로드 시 변환한다.
 */
const LEGACY_ROLE_TO_USER_TYPE: Record<string, UserType> = {
  DISCHARGER: 'CONSUMER',
  DEMOLITION: 'DEMOLITION_COMPANY',
  TRANSPORT: 'TRANSPORT_COMPANY',
  DISPOSAL: 'WASTE_TREATMENT_PLANT',
};

export interface CreateUserInput {
  userType: UserType;
  name: string;
  region: string;
  phone?: string;
  /** 업체 필수. 하이픈 포함 입력 허용, 정규화해 저장. */
  businessNumber?: string;
  /** 업체 기준 좌표(거리 기반 일감 추천용, 선택). */
  location?: GeoPoint;
  /** 소셜 로그인으로 가입 시 함께 연결할 신원(선택). */
  socialIdentity?: SocialIdentity;
}

export interface UpdateUserInput {
  name?: string;
  region?: string;
  phone?: string;
  /** 업체 기준 좌표 갱신(선택). */
  location?: GeoPoint;
}

export interface ListUsersFilter {
  userType?: UserType;
  approvalStatus?: UserApprovalStatus;
}

export class UserStore {
  private readonly users = new Map<string, UserProfile>();

  constructor(private readonly persistence?: CollectionPersistence<UserProfile>) {
    for (const user of persistence?.load() ?? []) {
      const migrated = migrateLegacyUser(user);
      this.users.set(migrated.id, migrated);
    }
  }

  private persist(): void {
    this.persistence?.save([...this.users.values()]);
  }

  create(input: CreateUserInput): UserProfile {
    if (!USER_TYPES.includes(input.userType)) {
      throw new UserValidationError(`userType 은 ${USER_TYPES.join(' | ')} 중 하나여야 합니다.`);
    }
    if (typeof input.name !== 'string' || input.name.trim().length === 0) {
      throw new UserValidationError('name(상호/이름)이 필요합니다.');
    }
    if (input.region !== PILOT.region) {
      throw new UserValidationError(`파일럿 기간에는 ${PILOT.region} 지역만 가입할 수 있습니다.`);
    }

    // 휴대폰번호 = 로그인 식별자 → 필수 + 고유. PII 이므로 오류에 값을 노출하지 않는다.
    const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
    if (!isValidPhone(phone)) {
      throw new UserValidationError('휴대폰번호(10~11자리)를 정확히 입력해 주세요.');
    }
    const phoneKey = normalizePhone(phone);
    if ([...this.users.values()].some((u) => u.phone && normalizePhone(u.phone) === phoneKey)) {
      throw new UserValidationError('이미 가입된 휴대폰번호입니다.');
    }

    if (input.location !== undefined && !isValidGeoPoint(input.location)) {
      throw new UserValidationError('유효한 좌표(lat -90~90, lng -180~180)가 필요합니다.');
    }

    const company = isCompanyType(input.userType);
    let businessNumber: string | undefined;
    if (company) {
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
      userType: input.userType,
      name: input.name.trim(),
      region: input.region,
      phone,
      ...(businessNumber ? { businessNumber } : {}),
      ...(input.location ? { location: input.location } : {}),
      ...(input.socialIdentity ? { socialIdentities: [input.socialIdentity] } : {}),
      // 소비자는 즉시 이용 가능, 업체는 관리자 승인 후 매칭 노출.
      approvalStatus: company ? 'PENDING' : 'APPROVED',
      // 운반업체는 콜대기 흐름 — 가입 직후엔 대기 종료(OFFLINE)로 시작.
      ...(usesCallAvailability(input.userType) ? { availability: 'OFFLINE' as CallAvailability } : {}),
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

  /**
   * 휴대폰번호로 계정 조회 (파일럿 로그인 식별). 하이픈·공백 무시하고 정규화 비교.
   * phone 은 PII — 반환값을 로그에 남기지 않는다.
   */
  getByPhone(phoneInput: string): UserProfile | undefined {
    const key = normalizePhone(phoneInput);
    if (key.length < 10) return undefined;
    return [...this.users.values()].find((u) => u.phone && normalizePhone(u.phone) === key);
  }

  /**
   * 소셜 신원(공급자 + 공급자 고유 id)으로 계정 조회 — 소셜 로그인 매칭 키.
   * email 이 아니라 providerUserId 로만 매칭한다(이메일 변경/사칭 대비).
   */
  getBySocialIdentity(provider: SocialProvider, providerUserId: string): UserProfile | undefined {
    return [...this.users.values()].find((u) =>
      u.socialIdentities?.some(
        (s) => s.provider === provider && s.providerUserId === providerUserId,
      ),
    );
  }

  /**
   * 계정에 소셜 신원을 연결(멱등). 공급자당 1개만 유지한다.
   * 이미 같은 신원이 있으면 그대로 반환한다.
   */
  linkSocialIdentity(userId: string, identity: SocialIdentity): UserProfile {
    const user = this.requireUser(userId);
    const existing = user.socialIdentities ?? [];
    if (
      existing.some(
        (s) => s.provider === identity.provider && s.providerUserId === identity.providerUserId,
      )
    ) {
      return user;
    }
    // 공급자당 하나 — 기존 같은 공급자 연결은 교체한다.
    const kept = existing.filter((s) => s.provider !== identity.provider);
    const updated: UserProfile = {
      ...user,
      socialIdentities: [...kept, identity],
      updatedAt: new Date().toISOString(),
    };
    this.users.set(userId, updated);
    this.persist();
    return updated;
  }

  list(filter: ListUsersFilter = {}): UserProfile[] {
    return [...this.users.values()]
      .filter(
        (u) =>
          (filter.userType === undefined || u.userType === filter.userType) &&
          (filter.approvalStatus === undefined || u.approvalStatus === filter.approvalStatus),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  update(id: string, input: UpdateUserInput): UserProfile {
    const user = this.requireUser(id);
    if (input.region !== undefined && input.region !== PILOT.region) {
      throw new UserValidationError(`파일럿 기간에는 ${PILOT.region} 지역만 지원합니다.`);
    }
    // 휴대폰번호는 로그인 식별자 → 비우기 불가, 변경 시 형식·고유성 검증.
    let phonePatch: { phone?: string } = {};
    if (input.phone !== undefined && input.phone.trim() !== '') {
      if (!isValidPhone(input.phone)) {
        throw new UserValidationError('휴대폰번호(10~11자리)를 정확히 입력해 주세요.');
      }
      const key = normalizePhone(input.phone);
      const taken = [...this.users.values()].some(
        (u) => u.id !== id && u.phone && normalizePhone(u.phone) === key,
      );
      if (taken) {
        throw new UserValidationError('이미 가입된 휴대폰번호입니다.');
      }
      phonePatch = { phone: input.phone.trim() };
    }
    if (input.location !== undefined && !isValidGeoPoint(input.location)) {
      throw new UserValidationError('유효한 좌표(lat -90~90, lng -180~180)가 필요합니다.');
    }
    const updated: UserProfile = {
      ...user,
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      ...(input.region ? { region: input.region } : {}),
      ...phonePatch,
      ...(input.location ? { location: input.location } : {}),
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

  /**
   * 운반업체 콜대기 상태(ONLINE/OFFLINE) 갱신.
   * 운반업체(TRANSPORT_COMPANY)만 호출 가능 — 대기 중이어야 매칭 요청을 받는다.
   */
  setAvailability(id: string, availability: CallAvailability): UserProfile {
    const user = this.requireUser(id);
    if (!usesCallAvailability(user.userType)) {
      throw new UserValidationError('콜대기 상태 변경은 운반업체만 가능합니다.');
    }
    const updated: UserProfile = { ...user, availability, updatedAt: new Date().toISOString() };
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
    if (!isCompanyType(user.userType)) {
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

/** 휴대폰번호 정규화 — 하이픈·공백 제거 후 숫자만. 로그인 식별·중복 판정 기준. */
function normalizePhone(input: string): string {
  return input.replace(/\D/g, '');
}

/** 휴대폰번호 형식(숫자 10~11자리) 확인. */
function isValidPhone(input: string): boolean {
  const d = normalizePhone(input);
  return d.length >= 10 && d.length <= 11;
}

/**
 * 저장된 레코드를 신규 스키마(userType)로 변환한다.
 * 레거시 레코드는 role 필드만 가지므로 user_type 으로 매핑하고, 매핑 불가 시 CONSUMER 로 둔다.
 */
function migrateLegacyUser(raw: UserProfile & { role?: string }): UserProfile {
  if (raw.userType) return raw;
  const { role, ...rest } = raw;
  const userType: UserType = (role ? LEGACY_ROLE_TO_USER_TYPE[role] : undefined) ?? 'CONSUMER';
  return {
    ...rest,
    userType,
    ...(usesCallAvailability(userType) && raw.availability === undefined
      ? { availability: 'OFFLINE' as CallAvailability }
      : {}),
  };
}
