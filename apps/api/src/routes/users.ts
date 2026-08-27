import {
  isCompanyType,
  isValidBusinessNumber,
  isValidGeoPoint,
  type AuthSession,
  type CallAvailability,
  type GeoPoint,
  type UserApprovalStatus,
  type UserType,
} from '@dimol/shared';
import { Router, type Request, type Response } from 'express';
import { AllbaroClient, AllbaroError, createAllbaroClient } from '../allbaro/client.js';
import type { OtpService } from '../auth/otp-service.js';
import { isValidPassword, type CredentialStore } from '../auth/credential-store.js';
import type { OAuthService } from '../auth/oauth/oauth-service.js';
import type { SessionStore } from '../auth/session-store.js';
import { authUserId } from '../middleware/auth.js';
import { UserStore, UserValidationError, type CreateUserInput } from '../users/store.js';

/** { lat, lng } 형태만 좌표로 인정. 그 외(누락/형식오류)는 undefined. */
function parseGeoPoint(raw: unknown): GeoPoint | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { lat, lng } = raw as { lat?: unknown; lng?: unknown };
  if (typeof lat !== 'number' || typeof lng !== 'number') return undefined;
  const point = { lat, lng };
  return isValidGeoPoint(point) ? point : undefined;
}

/**
 * 회원 온보딩·프로필 API (로드맵 Phase 1 §4.1).
 * 가입 유형(user_type)별로 절차가 갈린다:
 *  - 소비자(CONSUMER): 사업자등록번호 없이 가입.
 *  - 업체(철거/운반/처리): 사업자등록번호 필수 + 올바로 회원 검증 API 실시간 검증.
 * 공통: 휴대폰 OTP 인증을 마친 번호만 가입 가능. 가입 성공 시 세션 토큰을 함께 발급(자동 로그인).
 *
 * ⚠️ CLAUDE.md「사람이 반드시 직접 diff를 검토해야 하는 영역」— 올바로 API 연동(회원 검증).
 *   자동 커밋/머지 금지. 사람이 diff 검토 + 올바로 샌드박스 계정으로 검증 후 반영한다.
 */
export function createUsersRouter(
  store: UserStore,
  otpService: OtpService,
  sessionStore: SessionStore,
  credentialStore: CredentialStore,
  allbaro: AllbaroClient = createAllbaroClient(),
  oauth?: OAuthService,
): Router {
  const router = Router();

  function handleError(err: unknown, res: { status(code: number): { json(body: unknown): void } }) {
    if (err instanceof UserValidationError) {
      const status = err.message.includes('찾을 수 없습니다') ? 404 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: '회원 처리 오류' });
  }

  /** 본인 계정 확인 — 다른 회원의 리소스를 수정하려 하면 403. */
  function assertSelf(req: Request, res: Response): boolean {
    if (authUserId(req) !== req.params.id) {
      res.status(403).json({ error: '본인 계정만 변경할 수 있어요.' });
      return false;
    }
    return true;
  }

  // POST /api/users — 온보딩 (유형별 분기: 소비자 즉시 가입 / 업체 올바로 검증)
  router.post('/users', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const userType = body.userType;
    if (typeof userType !== 'string') {
      res.status(400).json({ error: 'userType(가입 유형)이 필요합니다.' });
      return;
    }
    const businessNumber = typeof body.businessNumber === 'string' ? body.businessNumber : undefined;
    const phone = typeof body.phone === 'string' ? body.phone : '';

    // 휴대폰 OTP 인증을 마친 번호만 가입 허용(번호 소유 확인).
    if (!phone || !(await otpService.isPhoneVerified(phone))) {
      res.status(403).json({ error: '휴대폰 인증을 먼저 완료해 주세요.', code: 'PHONE_NOT_VERIFIED' });
      return;
    }

    // 비밀번호 — 번호+비밀번호 로그인용. 소셜 가입(티켓)일 때는 선택.
    const password = body.password;
    const isSocialSignup = typeof body.socialTicket === 'string';
    if (!isSocialSignup && !isValidPassword(password)) {
      res.status(400).json({ error: '비밀번호를 6자 이상으로 설정해 주세요.' });
      return;
    }

    // 업체 유형: 사업자등록번호 필수 + 올바로 회원 검증(실시간).
    let allbaroVerifiedAt: string | undefined;
    if (isCompanyType(userType as UserType)) {
      if (!businessNumber || !isValidBusinessNumber(businessNumber)) {
        // PII — 입력값을 메시지에 되돌려주지 않는다.
        res.status(400).json({ error: '유효한 사업자등록번호(10자리)가 필요합니다.' });
        return;
      }
      try {
        const verification = await allbaro.verifyMember(businessNumber);
        if (!verification.verified) {
          res
            .status(422)
            .json({ error: '올바로에 등록된 회원(사업자)이 아닙니다. 사업자등록번호를 확인해 주세요.' });
          return;
        }
        allbaroVerifiedAt = verification.checkedAt;
      } catch (err) {
        // 형식/체크섬 불량은 가입 차단. 그 외(설정 누락·타임아웃·업스트림 장애)는
        // 올바로 폴백 원칙에 따라 미인증 상태로 가입만 진행하고 관리자 승인을 백스톱으로 둔다.
        if (err instanceof AllbaroError && err.code === 'INVALID_BUSINESS_NUMBER') {
          res.status(400).json({ error: err.message, code: err.code });
          return;
        }
        console.warn(
          '[users] 올바로 회원 검증 실패 — 미인증으로 가입 진행',
          err instanceof AllbaroError ? err.code : 'UNKNOWN',
        );
      }
    }

    // 소셜 로그인으로 진입한 가입: 티켓(신원 검증됨)을 계정에 함께 연결한다.
    let socialIdentity: CreateUserInput['socialIdentity'];
    if (typeof body.socialTicket === 'string') {
      const parsed = oauth?.verifySignupTicket(body.socialTicket);
      if (!parsed) {
        res.status(400).json({ error: '소셜 인증이 만료되었습니다. 다시 로그인해 주세요.', code: 'SOCIAL_TICKET_INVALID' });
        return;
      }
      const linkedElsewhere = await store.getBySocialIdentity(parsed.provider, parsed.providerUserId);
      if (linkedElsewhere) {
        res.status(409).json({ error: '이미 가입된 소셜 계정입니다. 로그인해 주세요.', code: 'SOCIAL_ALREADY_LINKED' });
        return;
      }
      socialIdentity = {
        provider: parsed.provider,
        providerUserId: parsed.providerUserId,
        ...(parsed.email ? { email: parsed.email } : {}),
        linkedAt: new Date().toISOString(),
      };
    }

    try {
      const created = await store.create({
        userType: userType as UserType,
        name: body.name,
        // 전국구 서비스 — 활동 지역은 입력받지 않고 기본값으로 둔다.
        region: typeof body.region === 'string' && body.region.trim() ? body.region : '전국',
        phone,
        businessNumber,
        location: parseGeoPoint(body.location),
        ...(socialIdentity ? { socialIdentity } : {}),
      } as CreateUserInput);
      // 올바로 검증 성공 시 [올바로 인증 업체] 배지 부여.
      const user = allbaroVerifiedAt
        ? await store.setAllbaroCertified(created.id, true, allbaroVerifiedAt)
        : created;
      // 비밀번호 설정(번호+비밀번호 로그인). 소셜 가입은 비밀번호 없이 통과 가능.
      if (isValidPassword(password)) {
        credentialStore.setPassword(user.id, phone, password);
      }
      // 번호 인증 창 소진 + 세션 토큰 발급(가입 즉시 로그인·자동 로그인).
      await otpService.consumePhoneVerification(phone);
      const session: AuthSession = { token: await sessionStore.issue(user.id), user };
      res.status(201).json(session);
    } catch (err) {
      handleError(err, res);
    }
  });

  // GET /api/users?userType=&approvalStatus= — 목록
  router.get('/users', async (req, res) => {
    const { userType, approvalStatus } = req.query;
    res.json(
      await store.list({
        userType: typeof userType === 'string' ? (userType as UserType) : undefined,
        approvalStatus:
          typeof approvalStatus === 'string'
            ? (approvalStatus as UserApprovalStatus)
            : undefined,
      }),
    );
  });

  // GET /api/users/:id — 프로필 조회. 본인은 전체, 타인은 PII(연락처·사업자번호) 제외 공개 프로필.
  router.get('/users/:id', async (req, res) => {
    const user = await store.get(req.params.id);
    if (!user) {
      res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
      return;
    }
    if (authUserId(req) === user.id) {
      res.json(user);
      return;
    }
    // 타인 조회 — 연락처·사업자번호 같은 PII 는 노출하지 않는다.
    const publicProfile = { ...user };
    delete publicProfile.phone;
    delete publicProfile.businessNumber;
    res.json(publicProfile);
  });

  // PATCH /api/users/:id/availability — 운반업체 콜대기 상태 토글 (ONLINE/OFFLINE)
  router.patch('/users/:id/availability', (req, res) => {
    if (!assertSelf(req, res)) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const availability = body.availability;
    if (availability !== 'ONLINE' && availability !== 'OFFLINE') {
      res.status(400).json({ error: "availability 는 'ONLINE' 또는 'OFFLINE' 이어야 합니다." });
      return;
    }
    try {
      res.json(store.setAvailability(req.params.id, availability as CallAvailability));
    } catch (err) {
      handleError(err, res);
    }
  });

  // PATCH /api/users/:id/offers-transport — 처리장 운반요청 제공 여부 토글 (처리장만)
  router.patch('/users/:id/offers-transport', (req, res) => {
    if (!assertSelf(req, res)) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.offersTransport !== 'boolean') {
      res.status(400).json({ error: 'offersTransport(true/false)가 필요합니다.' });
      return;
    }
    try {
      res.json(store.setOffersTransport(req.params.id, body.offersTransport));
    } catch (err) {
      handleError(err, res);
    }
  });

  // PATCH /api/users/:id/certifications — 보험·허가증 등록 (업체만, 로드맵 Phase 2 인증 고도화)
  router.patch('/users/:id/certifications', (req, res) => {
    if (!assertSelf(req, res)) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      res.json(
        store.setCertifications(req.params.id, {
          insuranceRegistered:
            typeof body.insuranceRegistered === 'boolean' ? body.insuranceRegistered : undefined,
          permitRegistered:
            typeof body.permitRegistered === 'boolean' ? body.permitRegistered : undefined,
        }),
      );
    } catch (err) {
      handleError(err, res);
    }
  });

  // PATCH /api/users/:id — 프로필 수정 (이름/연락처/지역)
  router.patch('/users/:id', (req, res) => {
    if (!assertSelf(req, res)) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      res.json(
        store.update(req.params.id, {
          name: typeof body.name === 'string' ? body.name : undefined,
          region: typeof body.region === 'string' ? body.region : undefined,
          phone: typeof body.phone === 'string' ? body.phone : undefined,
          location: parseGeoPoint(body.location),
        }),
      );
    } catch (err) {
      handleError(err, res);
    }
  });

  return router;
}
