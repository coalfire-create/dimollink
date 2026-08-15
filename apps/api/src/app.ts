import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import type {
  AppNotification,
  ChatMessage,
  Incident,
  InteriorBid,
  InteriorRequest,
  MatchOffer,
  ProviderPricing,
  Quote,
  Review,
  ServiceRequest,
  UserProfile,
} from '@dimol/shared';
import type { PersistedSession, SessionStore } from './auth/session-store.js';
import type { RateLimitStore } from './middleware/security.js';
import { env } from './config/env.js';
import { jsonPersistenceFactory, type PersistenceFactory } from './lib/json-collection.js';
import { AnomalyDetector } from './anomaly/detect.js';
import { ChatStore } from './chat/store.js';
import { HeuristicVolumeEstimator } from './estimation/provider.js';
import { ClaudeSiteAnalyzer, GeminiSiteAnalyzer, GroqSiteAnalyzer, MockSiteAnalyzer } from './site-analysis/analyzer.js';
import { LocationStore } from './locations/store.js';
import { ConsoleNotificationProvider } from './notifications/provider.js';
import { NotificationService } from './notifications/service.js';
import { OfferStore } from './offers/store.js';
import { InteriorStore } from './interior/store.js';
import { compositePayableStore } from './payment/payable-request.js';
import { PaymentStore, type PaymentRecord } from './payment/payment-store.js';
import { QuoteStore } from './quotes/store.js';
import { PricingStore } from './pricing/store.js';
import { RequestStore } from './requests/store.js';
import { ReviewStore } from './reviews/store.js';
import { UserStore } from './users/store.js';
import { OtpService, type OtpKv } from './auth/otp-service.js';
import { CredentialStore, type CredentialRecord } from './auth/credential-store.js';
import { SessionTokenStore } from './auth/session-store.js';
import { createSmsSender } from './auth/sms-sender.js';
import { seedTestAccounts } from './dev/seed.js';
import { createGeocoder } from './geo/geocoder.js';
import { createAdminAuth } from './middleware/admin-auth.js';
import { createRequireAuth } from './middleware/auth.js';
import { createRateLimiter, requestId, requestLogger, securityHeaders } from './middleware/security.js';
import { Metrics, metricsMiddleware } from './observability/metrics.js';
import { createAllbaroRouter } from './routes/allbaro.js';
import { createAuthRouter } from './routes/auth.js';
import { createOAuthRouter } from './routes/oauth.js';
import { OAuthService } from './auth/oauth/oauth-service.js';
import { healthRouter } from './routes/health.js';
import { createMatchingRouter } from './routes/matching.js';
import { createPaymentsRouter } from './routes/payments.js';
import { createAdminRouter } from './routes/admin.js';
import { createChatRouter } from './routes/chat.js';
import { createEstimationRouter } from './routes/estimation.js';
import { createSiteAnalysisRouter } from './routes/site-analysis.js';
import { createJobsRouter } from './routes/jobs.js';
import { createLocationsRouter } from './routes/locations.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createOffersRouter } from './routes/offers.js';
import { createInteriorRouter } from './routes/interior.js';
import { createQuotesRouter } from './routes/quotes.js';
import { createPricingRouter } from './routes/pricing.js';
import { createRequestsRouter } from './routes/requests.js';
import { createReviewsRouter } from './routes/reviews.js';
import { createUploadsRouter } from './routes/uploads.js';
import { createUsersRouter } from './routes/users.js';

/** 다중 인스턴스에서 공유해야 하는 상태 저장소(Redis). 미주입 시 인메모리/영속 폴백. */
export interface SharedStores {
  sessionStore?: SessionStore;
  rateLimitStore?: RateLimitStore;
  otpKv?: OtpKv;
}

/**
 * Express 앱 구성 (서버 기동과 분리해 테스트에서 재사용 가능).
 * persistence 팩토리로 JSON/PostgreSQL 을, shared 로 Redis(세션·레이트리밋)를 주입한다.
 */
export function createApp(
  persistence: PersistenceFactory = jsonPersistenceFactory(env.dataDir),
  shared: SharedStores = {},
) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true); // 프록시(로드밸런서/Vercel) 뒤 실제 클라이언트 IP 사용.

  // CORS: 운영에서는 허용 출처(CORS_ORIGINS)만, 미설정 시(개발) 전체 허용.
  app.use(
    cors(
      env.corsOrigins.length > 0
        ? { origin: env.corsOrigins, credentials: true }
        : undefined,
    ),
  );
  app.use(securityHeaders(env.isProduction));
  app.use(requestId());
  const metrics = new Metrics();
  app.use(metricsMiddleware(metrics));
  app.use(requestLogger());
  // 포트원 웹훅은 서명 검증에 원본 바디가 필요하므로 이 경로만 raw 로 받는다(전역 json 이전).
  app.use('/api/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }));
  app.use(express.json({ limit: '1mb' })); // 과대 페이로드 차단.

  // ── 정적 자산: Expo 웹 앱(SPA) + 법적 고지 페이지. Railway 단일 호스팅(Netlify 대체).
  //    dist/app.js 기준 ../public = apps/api/public. 웹 앱은 public/web(Expo export).
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
  const webDir = join(publicDir, 'web');
  // 웹 앱 정적 자산(_expo·assets·favicon). index 자동제공은 끄고 SPA 폴백이 담당.
  app.use(express.static(webDir, { index: false }));
  // 법적 고지·랜딩 — 스토어/앱 링크가 요구하는 공개 URL(명시 경로).
  app.get('/privacy', (_req: Request, res: Response) => res.sendFile(join(publicDir, 'privacy.html')));
  app.get('/terms', (_req: Request, res: Response) => res.sendFile(join(publicDir, 'terms.html')));
  app.get('/landing', (_req: Request, res: Response) => res.sendFile(join(publicDir, 'index.html')));

  // 헬스체크는 레이트리밋 이전에 처리(오케스트레이터 헬스체크가 제한에 걸리지 않게).
  app.use('/api', healthRouter);

  // 전역 레이트리밋(기본 DDoS·남용 완화) — IP 기준. 정상 사용에 넉넉한 상한.
  app.use(
    '/api',
    createRateLimiter(
      { windowMs: 60_000, max: 300, keyPrefix: 'global' },
      shared.rateLimitStore,
    ),
  );
  // 인증 엔드포인트 남용(무차별 대입·OTP 폭탄) 방지 — 더 엄격한 상한.
  app.use(
    '/api/auth',
    createRateLimiter(
      {
        windowMs: 60_000,
        max: 20,
        keyPrefix: 'auth',
        message: '인증 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
      },
      shared.rateLimitStore,
    ),
  );

  const notificationService = new NotificationService(
    new ConsoleNotificationProvider(),
    persistence<AppNotification>('notifications'),
  );
  const requestStore = new RequestStore(
    persistence<ServiceRequest>('requests'),
    (request) => notificationService.notifyStatusChange(request),
    // 신규 운반요청 → 같은 지역·콜대기(ONLINE) 운반업체 중 반경 30km 이내에 "콜" 알림.
    (request) => {
      if (request.kind !== 'TRANSPORT') return;
      const companies = userStore
        .list({ userType: 'TRANSPORT_COMPANY' })
        .filter(
          (u) =>
            u.availability === 'ONLINE' &&
            u.region === request.region &&
            u.id !== request.requesterId,
        );
      notificationService.notifyTransportCall(request, companies);
    },
  );
  const userStore = new UserStore(persistence<UserProfile>('users'));
  // 번호+비밀번호 로그인용 자격증명(해시). UserProfile 과 분리 저장(응답 노출 방지).
  const credentialStore = new CredentialStore(
    persistence<CredentialRecord>('credentials', (c) => c.userId),
  );
  // 테스트/스테이징 배포: 역할별 계정 시드(멱등). 운영에서는 SEED_TEST_ACCOUNTS 를 켜지 않는다.
  if (env.seedTestAccounts) seedTestAccounts(userStore);
  // 휴대폰 OTP + 세션 토큰(자동 로그인) — 파일럿은 메모리 보관, 서버 재시작 시 초기화.
  // devMasterCode 는 비운영 환경에서만 주입된다(운영에서는 undefined → 마스터코드 없음).
  const otpService = new OtpService({
    sender: createSmsSender(),
    kv: shared.otpKv, // Redis(다중 인스턴스) 주입 시 공유, 없으면 인메모리.
    ttlMs: env.otp.ttlSec * 1000,
    resendCooldownMs: env.otp.resendCooldownSec * 1000,
    maxAttempts: env.otp.maxAttempts,
    // 운영에서는 마스터 인증코드를 비활성화한다. 단, 테스트 배포는 ALLOW_TEST_OTP=true 로 허용.
    devMasterCode: env.isProduction && !env.allowTestOtp ? undefined : env.otp.devMasterCode,
  });
  // 세션: Redis(다중 인스턴스) 주입 시 그걸 쓰고, 없으면 영속 인메모리(재시작 유지).
  const sessionStore: SessionStore =
    shared.sessionStore ??
    new SessionTokenStore({
      ttlMs: env.auth.sessionTtlDays * 24 * 60 * 60 * 1000,
      persistence: persistence<PersistedSession>('sessions', (s) => s.token),
    });
  const reviewStore = new ReviewStore(
    requestStore,
    persistence<Review>('reviews'),
    persistence<Incident>('incidents'),
  );
  const quoteStore = new QuoteStore(requestStore, persistence<Quote>('quotes'));
  const offerStore = new OfferStore(requestStore, persistence<MatchOffer>('offers'));
  // 인테리어 밀봉 역경매(파일럿 밖) — FEATURE_INTERIOR 로 켤 때만 라우터를 마운트한다.
  const interiorStore = new InteriorStore(
    persistence<InteriorRequest>('interior-requests'),
    persistence<InteriorBid>('interior-bids'),
  );
  const paymentStore = new PaymentStore(
    persistence<PaymentRecord>('payments', (p) => p.paymentId),
  );
  // 업체 단가(마이페이지 설정) — 견적 기본값·시세 참고에 쓴다.
  const pricingStore = new PricingStore(persistence<ProviderPricing>('pricing', (p) => p.userId));

  // ── 인증 게이트: 로그인(세션 토큰)이 필요한 경로. 회원가입·로그인·헬스·조회성 일부는 공개.
  const requireAuth = createRequireAuth(sessionStore, userStore);
  app.use('/api/requests', requireAuth); // 요청 생성/조회/상태변경/채팅/위치 — 참여자 본인만
  app.use('/api/jobs', requireAuth); // 업체 일감 피드/수락 — 본인 계정만
  app.use('/api/notifications', requireAuth); // 알림 — 본인 것만
  app.use('/api/reviews', requireAuth); // 리뷰 작성/조회 — 작성자는 인증된 본인
  app.use('/api/incidents', requireAuth); // 노쇼/분쟁 신고 — 신고자는 인증된 본인
  app.use('/api/users/:id', requireAuth); // 프로필 수정·콜대기·인증서류 — 본인만(회원가입 POST /users 는 공개)
  app.get('/api/users', requireAuth); // 회원 목록(PII) — 최소 로그인 필요(추후 관리자 전용으로 제한)
  // 올바로: 회원검증·전자인계서 발행은 로그인, 재시도 큐/실패 목록(스케줄러·운영)은 관리자 전용.
  app.post('/api/allbaro/verify-member', requireAuth);
  app.post('/api/allbaro/manifest', requireAuth);
  app.use('/api/quotes', requireAuth); // 견적 제출/조회·시세 — 로그인 필요
  app.use('/api/pricing', requireAuth); // 업체 단가 조회/설정 — 본인만
  app.use('/api/offers', requireAuth); // 자동매칭 오퍼(Phase 3) — 로그인 필요(오퍼 생성/스윕의 관리자 전용화는 후속)
  if (env.features.interior) app.use('/api/interior', requireAuth); // 인테리어 요청/입찰 — 로그인 필요(밀봉 viewer 판정)

  // 결제/정산 — 금전 이동. 선결제·취소는 로그인, 지급대행은 관리자/스케줄러 전용.
  const requireAdmin = createAdminAuth(env.adminToken);
  // 메트릭 노출 — 관리자 토큰(스크레이퍼)만. Prometheus 텍스트 형식.
  app.get('/api/metrics', requireAdmin, (_req, res) => {
    res.type('text/plain').send(metrics.render());
  });
  app.post('/api/payments/prepay', requireAuth);
  app.post('/api/payments/cancel', requireAuth);
  app.post('/api/payments/refund/preview', requireAuth);
  app.post('/api/settlements/preview', requireAuth);
  app.post('/api/payments/payouts', requireAdmin);
  // 올바로 전자인계서 재시도 큐/실패 목록 — 스케줄러·운영 전용.
  app.use('/api/allbaro/manifest/retry', requireAdmin);
  app.use('/api/allbaro/manifest/queue', requireAdmin);
  app.use('/api/allbaro/manifest/failures', requireAdmin);

  app.use('/api', createAllbaroRouter());
  // 결제/정산은 폐기물·인테리어 요청을 합친 창구로 처리(합의 금액=agreedFee 기준 선결제·정산).
  app.use(
    '/api',
    createPaymentsRouter(
      undefined,
      compositePayableStore(requestStore, interiorStore),
      quoteStore,
      paymentStore,
      userStore,
    ),
  );
  app.use('/api', createMatchingRouter((providerId) => reviewStore.ratingSummary(providerId).average));
  app.use('/api', createUploadsRouter());
  app.use('/api', createRequestsRouter(requestStore, createGeocoder()));
  app.use('/api', createJobsRouter(requestStore, userStore));
  app.use('/api', createAuthRouter(userStore, otpService, sessionStore, credentialStore));
  // 소셜 로그인(카카오/구글/네이버). 자격증명 미설정 시 각 라우트가 503 으로 안내.
  const oauthService = new OAuthService({
    credentials: {
      kakao: { clientId: env.oauth.kakao.clientId ?? '', clientSecret: env.oauth.kakao.clientSecret ?? '' },
      google: { clientId: env.oauth.google.clientId ?? '', clientSecret: env.oauth.google.clientSecret ?? '' },
      naver: { clientId: env.oauth.naver.clientId ?? '', clientSecret: env.oauth.naver.clientSecret ?? '' },
    },
    redirectBase: env.oauth.redirectBase,
    secret: env.oauth.secret,
  });
  app.use('/api', createOAuthRouter(userStore, otpService, sessionStore, oauthService, env.oauth.appRedirect));
  app.use('/api', createUsersRouter(userStore, otpService, sessionStore, credentialStore, undefined, oauthService));
  app.use('/api', createReviewsRouter(reviewStore));
  app.use('/api', createQuotesRouter(quoteStore, userStore, requestStore));
  app.use('/api', createPricingRouter(pricingStore));
  // 인테리어 밀봉 역경매 — 플래그가 켜졌을 때만 노출(꺼져 있으면 경로 자체가 404).
  if (env.features.interior) app.use('/api', createInteriorRouter(interiorStore));
  app.use('/api', createOffersRouter(offerStore));
  app.use('/api', createNotificationsRouter(notificationService));
  app.use('/api', createLocationsRouter(new LocationStore(requestStore)));
  app.use(
    '/api',
    createChatRouter(new ChatStore(requestStore, persistence<ChatMessage>('chat'))),
  );
  app.use('/api', createEstimationRouter(new HeuristicVolumeEstimator()));
  // 현장 사진 AI 분석: 키 있으면 Claude 비전, 없으면 목. 실제 분석 실패 시 목으로 폴백.
  const mockSiteAnalyzer = new MockSiteAnalyzer();
  // 공급자 우선순위: Groq(무료·카드불필요) > Gemini(무료티어) > Claude(유료) > 목. 실패 시 라우터가 목 폴백.
  const siteAnalyzer = env.ai.groqApiKey
    ? new GroqSiteAnalyzer({
        apiKey: env.ai.groqApiKey,
        model: env.ai.groqModel,
        timeoutMs: env.ai.visionTimeoutMs,
      })
    : env.ai.geminiApiKey
      ? new GeminiSiteAnalyzer({
          apiKey: env.ai.geminiApiKey,
          model: env.ai.geminiModel,
          timeoutMs: env.ai.visionTimeoutMs,
        })
      : env.ai.anthropicApiKey
        ? new ClaudeSiteAnalyzer({
            apiKey: env.ai.anthropicApiKey,
            model: env.ai.anthropicModel,
            timeoutMs: env.ai.visionTimeoutMs,
          })
        : mockSiteAnalyzer;
  app.use('/api', createSiteAnalysisRouter(siteAnalyzer, mockSiteAnalyzer, new HeuristicVolumeEstimator()));
  app.use(
    '/api',
    createAdminRouter(
      {
        userStore,
        reviewStore,
        requestStore,
        offerStore,
        anomalyDetector: new AnomalyDetector(requestStore, quoteStore),
        quoteStore,
        pricingStore,
      },
      env.adminToken,
    ),
  );

  // SPA 폴백 — /api 외 GET 요청은 Expo 웹 앱 진입점으로(클라이언트 라우팅 지원).
  app.get(/^(?!\/api(\/|$)).*/, (_req: Request, res: Response) => {
    res.sendFile(join(webDir, 'index.html'));
  });

  // 404 — 정의되지 않은 경로(주로 /api/* 미매칭).
  app.use((_req, res) => {
    res.status(404).json({ error: '요청한 리소스를 찾을 수 없습니다.' });
  });

  // 중앙 오류 처리 — 미처리 예외를 500 JSON 으로 변환하고 스택/내부정보는 노출하지 않는다.
  // (JSON 파싱 오류 등 프레임워크 예외 포함)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
      res.status(413).json({ error: '요청 본문이 너무 큽니다.' });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: '요청 형식(JSON)이 올바르지 않습니다.' });
      return;
    }
    console.error('[api] 처리되지 않은 오류', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  });

  return app;
}
