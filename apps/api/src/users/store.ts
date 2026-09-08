import { randomUUID } from 'node:crypto';
import {
  USER_TYPES,
  isCompanyType,
  isValidBusinessNumber,
  isValidGeoPoint,
  normalizeBusinessNumber,
  usesCallAvailability,
  usesOffersTransport,
  type CallAvailability,
  type GeoPoint,
  type SocialIdentity,
  type SocialProvider,
  type UserApprovalStatus,
  type UserRole,
  type UserProfile,
  type UserType,
} from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';

export class UserValidationError extends Error {}

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
  businessNumber?: string;
  location?: GeoPoint;
  socialIdentity?: SocialIdentity;
  autoApprove?: boolean;
}

export interface UpdateUserInput {
  name?: string;
  region?: string;
  phone?: string;
  location?: GeoPoint;
}

export interface ListUsersFilter {
  userType?: UserType;
  approvalStatus?: UserApprovalStatus;
}

export class UserStore {
  private readonly fallbackMap = new Map<string, UserProfile>();

  constructor(private readonly persistence?: CollectionPersistence<UserProfile>) {}

  private async getInner(id: string): Promise<UserProfile | undefined> {
    let user: UserProfile | undefined;
    if (this.persistence) {
      user = await this.persistence.get(id);
    } else {
      user = this.fallbackMap.get(id);
    }
    return user ? migrateLegacyUser(user) : undefined;
  }

  private async listInner(): Promise<UserProfile[]> {
    let all: UserProfile[];
    if (this.persistence) {
      all = await this.persistence.list();
    } else {
      all = [...this.fallbackMap.values()];
    }
    return all.map(migrateLegacyUser);
  }

  private async saveInner(user: UserProfile): Promise<void> {
    if (this.persistence) {
      await this.persistence.save(user);
    } else {
      this.fallbackMap.set(user.id, user);
    }
  }

  async create(input: CreateUserInput): Promise<UserProfile> {
    if (!USER_TYPES.includes(input.userType)) {
      throw new UserValidationError(`userType 은 ${USER_TYPES.join(' | ')} 중 하나여야 합니다.`);
    }
    if (typeof input.name !== 'string' || input.name.trim().length === 0) {
      throw new UserValidationError('name(상호/이름)이 필요합니다.');
    }
    if (typeof input.region !== 'string' || input.region.trim().length === 0) {
      throw new UserValidationError('지역(활동 지역)이 필요합니다.');
    }

    const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
    if (!isValidPhone(phone)) {
      throw new UserValidationError('휴대폰번호(10~11자리)를 정확히 입력해 주세요.');
    }
    const phoneKey = normalizePhone(phone);
    const allUsers = await this.listInner();
    if (allUsers.some((u) => u.phone && normalizePhone(u.phone) === phoneKey)) {
      throw new UserValidationError('이미 가입된 휴대폰번호입니다.');
    }

    if (input.location !== undefined && !isValidGeoPoint(input.location)) {
      throw new UserValidationError('유효한 좌표(lat -90~90, lng -180~180)가 필요합니다.');
    }

    const company = isCompanyType(input.userType);
    let businessNumber: string | undefined;
    if (company) {
      if (!input.businessNumber || !isValidBusinessNumber(input.businessNumber)) {
        throw new UserValidationError('유효한 사업자등록번호(10자리)가 필요합니다.');
      }
      businessNumber = normalizeBusinessNumber(input.businessNumber);
      const duplicate = allUsers.some((u) => u.businessNumber === businessNumber);
      if (duplicate) {
        throw new UserValidationError('이미 가입된 사업자등록번호입니다.');
      }
    }

    const now = new Date().toISOString();
    const user: UserProfile = {
      id: randomUUID(),
      userType: input.userType,
      name: input.name.trim(),
      region: input.region.trim(),
      phone,
      ...(businessNumber ? { businessNumber } : {}),
      ...(input.location ? { location: input.location } : {}),
      ...(input.socialIdentity ? { socialIdentities: [input.socialIdentity] } : {}),
      approvalStatus: (company && !input.autoApprove) ? 'PENDING' : 'APPROVED',
      ...(usesCallAvailability(input.userType) ? { availability: 'OFFLINE' as CallAvailability } : {}),
      allbaroCertified: false,
      insuranceRegistered: false,
      permitRegistered: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.saveInner(user);
    return user;
  }

  async get(id: string): Promise<UserProfile | undefined> {
    return this.getInner(id);
  }

  async getByPhone(phoneInput: string): Promise<UserProfile | undefined> {
    const key = normalizePhone(phoneInput);
    if (key.length < 10) return undefined;
    const allUsers = await this.listInner();
    return allUsers.find((u) => u.phone && normalizePhone(u.phone) === key);
  }

  async getBySocialIdentity(provider: SocialProvider, providerUserId: string): Promise<UserProfile | undefined> {
    const allUsers = await this.listInner();
    return allUsers.find((u) =>
      u.socialIdentities?.some(
        (s) => s.provider === provider && s.providerUserId === providerUserId,
      ),
    );
  }

  async linkSocialIdentity(userId: string, identity: SocialIdentity): Promise<UserProfile> {
    const user = await this.requireUser(userId);
    const existing = user.socialIdentities ?? [];
    if (
      existing.some(
        (s) => s.provider === identity.provider && s.providerUserId === identity.providerUserId,
      )
    ) {
      return user;
    }
    const kept = existing.filter((s) => s.provider !== identity.provider);
    const updated: UserProfile = {
      ...user,
      socialIdentities: [...kept, identity],
      updatedAt: new Date().toISOString(),
    };
    await this.saveInner(updated);
    return updated;
  }

  async list(filter: ListUsersFilter = {}): Promise<UserProfile[]> {
    const allUsers = await this.listInner();
    return allUsers
      .filter(
        (u) =>
          (filter.userType === undefined || u.userType === filter.userType) &&
          (filter.approvalStatus === undefined || u.approvalStatus === filter.approvalStatus),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async update(id: string, input: UpdateUserInput): Promise<UserProfile> {
    const user = await this.requireUser(id);
    if (input.region !== undefined && input.region.trim().length === 0) {
      throw new UserValidationError('지역(활동 지역)이 필요합니다.');
    }
    let phonePatch: { phone?: string } = {};
    if (input.phone !== undefined && input.phone.trim() !== '') {
      if (!isValidPhone(input.phone)) {
        throw new UserValidationError('휴대폰번호(10~11자리)를 정확히 입력해 주세요.');
      }
      const key = normalizePhone(input.phone);
      const allUsers = await this.listInner();
      const taken = allUsers.some(
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
      ...(input.region?.trim() ? { region: input.region.trim() } : {}),
      ...phonePatch,
      ...(input.location ? { location: input.location } : {}),
      updatedAt: new Date().toISOString(),
    };
    await this.saveInner(updated);
    return updated;
  }

  async setApprovalStatus(id: string, status: UserApprovalStatus): Promise<UserProfile> {
    const user = await this.requireUser(id);
    const updated: UserProfile = { ...user, approvalStatus: status, updatedAt: new Date().toISOString() };
    await this.saveInner(updated);
    return updated;
  }

  /** 계정 권한 변경(백오피스 전용). 누가 바꿨는지는 호출부가 로그로 남긴다. */
  async setRole(id: string, role: UserRole): Promise<UserProfile> {
    const user = await this.requireUser(id);
    const updated: UserProfile = { ...user, role, updatedAt: new Date().toISOString() };
    await this.saveInner(updated);
    return updated;
  }

  async setAvailability(id: string, availability: CallAvailability, radiusKm?: number): Promise<UserProfile> {
    const user = await this.requireUser(id);
    if (!usesCallAvailability(user.userType)) {
      throw new UserValidationError('콜대기 상태 변경은 운반업체만 가능합니다.');
    }
    const updated: UserProfile = { 
      ...user, 
      availability, 
      ...(radiusKm !== undefined ? { matchRadiusKm: radiusKm } : {}),
      updatedAt: new Date().toISOString() 
    };
    await this.saveInner(updated);
    return updated;
  }

  async setAllbaroCertified(id: string, certified: boolean, checkedAt: string): Promise<UserProfile> {
    const user = await this.requireUser(id);
    const updated: UserProfile = {
      ...user,
      allbaroCertified: certified,
      allbaroCheckedAt: checkedAt,
      updatedAt: new Date().toISOString(),
    };
    await this.saveInner(updated);
    return updated;
  }


  async setOffersTransport(id: string, offersTransport: boolean): Promise<UserProfile> {
    const user = await this.requireUser(id);
    if (!usesOffersTransport(user.userType)) {
      throw new UserValidationError('운반요청 제공 여부는 처리장만 설정할 수 있습니다.');
    }
    const updated: UserProfile = {
      ...user,
      offersTransport,
      updatedAt: new Date().toISOString(),
    };
    await this.saveInner(updated);
    return updated;
  }

  async setCertifications(
    id: string,
    input: { insuranceRegistered?: boolean; permitRegistered?: boolean },
  ): Promise<UserProfile> {
    const user = await this.requireUser(id);
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
    await this.saveInner(updated);
    return updated;
  }

  private async requireUser(id: string): Promise<UserProfile> {
    const user = await this.getInner(id);
    if (!user) throw new UserValidationError('회원을 찾을 수 없습니다.');
    return user;
  }
}

function normalizePhone(input: string): string {
  return input.replace(/\D/g, '');
}

function isValidPhone(input: string): boolean {
  const d = normalizePhone(input);
  return d.length >= 10 && d.length <= 11;
}

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
