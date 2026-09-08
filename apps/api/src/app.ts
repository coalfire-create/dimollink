import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
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
import { ScanVolumeEstimator } from './estimation/scan-estimator.js';
import { SiteAnalysisQueue } from './site-analysis/queue.js';
import { SiteAnalysisStore, type SiteAnalysisRecord } from './site-analysis/store.js';
import {
  ClaudeSiteAnalyzer,
  GeminiSiteAnalyzer,
  GroqSiteAnalyzer,
  MockSiteAnalyzer,
} from './site-analysis/analyzer.js';
import { ConsensusSiteAnalyzer } from './site-analysis/consensus.js';
import { Scan3DQueue } from './scan3d/queue.js';
import { HttpReconstructor, MockReconstructor } from './scan3d/reconstructor.js';
import { LocationStore } from './locations/store.js';
import { ConsoleNotificationProvider } from './notifications/provider.js';
import { SmsNotificationProvider } from './notifications/sms-provider.js';
import { configureDefaultRetryQueue } from './allbaro/manifest-service.js';
import { createAllbaroClient } from './allbaro/client.js';
import { startScheduler } from './scheduler/index.js';
import { createRetryTask, createSettlementTask } from './scheduler/tasks.js';
import type { RetryQueueItem } from './allbaro/retry-queue.js';
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
import { createDemoAccess } from './middleware/demo-access.js';
import {
  createRateLimiter,
  requestId,
  requestLogger,
  securityHeaders,
} from './middleware/security.js';
import { Metrics, metricsMiddleware } from './observability/metrics.js';
import { createAllbaroRouter } from './routes/allbaro.js';
import { bearerToken, createAuthRouter } from './routes/auth.js';
import { createOAuthRouter } from './routes/oauth.js';
import { OAuthService } from './auth/oauth/oauth-service.js';
import { healthRouter } from './routes/health.js';
import { createMatchingRouter } from './routes/matching.js';
import { createPaymentsRouter } from './routes/payments.js';
import { createAdminRouter } from './routes/admin.js';
import { createChatRouter } from './routes/chat.js';
import { createEstimationRouter } from './routes/estimation.js';
import { createMapPageRouter } from './routes/map-page.js';
import { createScanViewerPageRouter } from './routes/scan-viewer-page.js';
import { createSiteAnalysisRouter } from './routes/site-analysis.js';
import { createScan3DRouter } from './routes/scan3d.js';
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

  // 응답 압축(gzip/br) — 웹 번들 1.8MB, 목록 JSON 응답이 모바일 회선에서 가장 큰 비용이다.
  // 이미 압축된 포맷(이미지·폰트)은 compression 이 알아서 건너뛴다.
  app.use(compression());

  // CORS: 운영에서는 허용 출처(CORS_ORIGINS)만, 미설정 시(개발) 전체 허용.
  app.use(
    cors(env.corsOrigins.length > 0 ? { origin: env.corsOrigins, credentials: true } : undefined),
  );
  app.use(securityHeaders(env.isProduction));
  app.use(requestId());
  const metrics = new Metrics();
  app.use(metricsMiddleware(metrics));
  app.use(requestLogger());
  // 포트원 웹훅은 서명 검증에 원본 바디가 필요하므로 이 경로만 raw 로 받는다(전역 json 이전).
  app.use('/api/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }));
  // 디몰비전 현장 사진은 가이드 촬영 최대 7슬롯을 base64 로 함께 올린다(클라이언트에서
  // 장변 1600px·JPEG 로 축소해 보내므로 장당 ~250KB). 이 경로만 한도를 올린다.
  app.use('/api/site-analysis', express.json({ limit: '12mb' }));
  app.use(express.json({ limit: '1mb' })); // 과대 페이로드 차단.

  // ── 정적 자산: Expo 웹 앱(SPA) + 법적 고지 페이지. Railway 단일 호스팅(Netlify 대체).
  //    dist/app.js 기준 ../public = apps/api/public. 웹 앱은 public/web(Expo export).
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
  const webDir = join(publicDir, 'web');
  app.use(
    express.static(webDir, {
      index: false,
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          // 배포 즉시 새 번들을 받도록 HTML 은 캐시하지 않는다.
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          return;
        }
        // Expo export 산출물은 파일명에 콘텐츠 해시가 박혀 있어 내용이 바뀌면 이름도 바뀐다.
        // 재방문·재실행 시 번들을 다시 받지 않도록 장기 immutable 캐시를 준다.
        // Expo 는 `index-<hash>.js`(하이픈)와 `asset.<hash>.png`(점) 두 형태를 모두 낸다.
        if (/[.-][0-9a-f]{16,}\.(js|css|png|jpg|jpeg|svg|ttf|otf|woff2?)$/i.test(path)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
  // 법적 고지·랜딩 — 스토어/앱 링크가 요구하는 공개 URL(명시 경로).
  app.get('/privacy', (_req: Request, res: Response) =>
    res.sendFile(join(publicDir, 'privacy.html')),
  );
  app.get('/terms', (_req: Request, res: Response) => res.sendFile(join(publicDir, 'terms.html')));
  app.get('/landing', (_req: Request, res: Response) =>
    res.sendFile(join(publicDir, 'index.html')),
  );

  // 헬스체크는 레이트리밋 이전에 처리(오케스트레이터 헬스체크가 제한에 걸리지 않게).
  app.use('/api', healthRouter);
  // 지도 페이지 — 앱이 iframe/WebView 로 띄운다(실제 URL 이어야 카카오 SDK 가 동작).
  app.use('/', createMapPageRouter());
  // 3D 스캔 뷰어 — 앱이 WebView 로 띄우는 실제 URL(지도 페이지와 같은 이유).
  app.use('/', createScanViewerPageRouter());

  // 전역 레이트리밋(기본 DDoS·남용 완화) — IP 기준. 정상 사용에 넉넉한 상한.
  app.use(
    '/api',
    createRateLimiter({ windowMs: 60_000, max: 300, keyPrefix: 'global' }, shared.rateLimitStore),
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

  // 외부 유료·쿼터 API 를 호출하는 경로(비전 AI, 공공데이터 건축물대장)는 더 엄격히 제한한다.
  // 호출당 실제 비용·일일 쿼터가 걸려 있어 전역 상한(300/분)만으로는 남용을 못 막는다.
  app.use(
    '/api/site-analysis',
    createRateLimiter(
      {
        windowMs: 60_000,
        max: 10,
        keyPrefix: 'vision',
        message: '현장 분석 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
      },
      shared.rateLimitStore,
    ),
  );
  app.use(
    '/api/locations/building-info',
    createRateLimiter(
      {
        windowMs: 60_000,
        max: 30,
        keyPrefix: 'bldg',
        message: '건축물대장 조회가 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
      },
      shared.rateLimitStore,
    ),
  );

  // 올바로 재시도 큐를 내구성 저장소에 붙인다. 인메모리면 재배포마다 통째로 사라지는데,
  // 여기 쌓이는 건 발행에 실패한 전자인계서라 유실이 곧 법정 미신고다.
  // 라우터가 getDefaultRetryQueue() 로 이 큐를 집어가므로 라우터 생성 전에 설정한다.
  configureDefaultRetryQueue(persistence<RetryQueueItem>('allbaro-retry-queue'));

  // 문자 발송기 하나를 인증코드와 매칭 알림이 함께 쓴다.
  const smsSender = createSmsSender();

  // 매칭 알림은 인앱 기록 + 문자 발송을 함께 한다.
  // 인앱만으로는 앱을 열어야 알 수 있어서, 배출자는 차가 언제 오는지 모르고
  // 운반업체는 콜을 놓친다. 문자 발송기는 인증코드용으로 이미 있는 것을 그대로 쓴다
  // — 두 벌로 나누면 발신번호·공급자 설정이 갈라진다.
  // 전화번호 조회는 발송 시점에 일어난다(userStore 는 아래에서 만들어진다).
  const notificationService = new NotificationService(
    new SmsNotificationProvider(
      smsSender,
      async (userId) => (await userStore.get(userId))?.phone,
      new ConsoleNotificationProvider(),
    ),
    persistence<AppNotification>('notifications'),
  );
  const requestStore = new RequestStore(
    persistence<ServiceRequest>('requests'),
    (request) => {
      notificationService.notifyStatusChange(request);
    },
    // 신규 운반요청 → 같은 지역·콜대기(ONLINE) 운반업체 중 반경 30km 이내에 "콜" 알림.
    async (request) => {
      if (request.kind !== 'TRANSPORT') return;
      const companies = (await userStore.list({ userType: 'TRANSPORT_COMPANY' })).filter(
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
  if (env.seedTestAccounts) void seedTestAccounts(userStore);
  // 휴대폰 OTP + 세션 토큰(자동 로그인) — 파일럿은 메모리 보관, 서버 재시작 시 초기화.
  // devMasterCode 는 비운영 환경에서만 주입된다(운영에서는 undefined → 마스터코드 없음).
  const otpService = new OtpService({
    sender: smsSender,
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
  const paymentStore = new PaymentStore(persistence<PaymentRecord>('payments', (p) => p.paymentId));
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
  // 디몰비전 분석은 호출당 비전 AI 비용이 발생하고, 건축물대장은 공공데이터 일일 쿼터를 쓴다.
  // 익명 호출을 열어두면 비용·쿼터가 그대로 남용 대상이 되므로 로그인 사용자로 제한한다.
  // 디몰비전 공모전 데모: 키가 설정된 경우에만 로그인 없이 분석을 허용한다(일일 상한 적용).
  // 키가 없으면 아래는 그대로 requireAuth 다 — 기본값은 여전히 "로그인 필수".
  const visionDemo = createDemoAccess({
    demoKey: env.ai.visionDemoKey,
    dailyLimit: env.ai.visionDemoDailyLimit,
  });
  app.use('/api/site-analysis', visionDemo.wrap(requireAuth));
  // 건축물대장도 같은 데모 문을 쓴다. 디몰비전 분석의 기준 정보라 둘이 함께 열려야
  // 의미가 있고, 일일 상한도 하나로 공유해 총 사용량이 상한을 넘지 않는다.
  app.use('/api/locations/building-info', visionDemo.wrap(requireAuth));
  // 3D 스캔도 같은 문을 쓴다. presign 을 익명에 열어두면 누구나 버킷에 200MB 를
  // 밀어넣을 수 있다 — 스토리지 비용이 그대로 남용 대상이 된다.
  // capability 조회는 상태 확인일 뿐이라 문 밖에 둔다(비용이 없고, 화면이 먼저 부른다).
  const scan3dGate = visionDemo.wrap(requireAuth);
  app.use('/api/scan3d', (req, res, next) => {
    if (req.method === 'GET' && req.path === '/capability') {
      next();
      return;
    }
    scan3dGate(req, res, next);
  });
  app.use('/api/pricing', requireAuth); // 업체 단가 조회/설정 — 본인만
  app.use('/api/offers', requireAuth); // 자동매칭 오퍼(Phase 3) — 로그인 필요(오퍼 생성/스윕의 관리자 전용화는 후속)
  if (env.features.interior) app.use('/api/interior', requireAuth); // 인테리어 요청/입찰 — 로그인 필요(밀봉 viewer 판정)

  // 결제/정산 — 금전 이동. 선결제·취소는 로그인, 지급대행은 관리자/스케줄러 전용.
  // 관리자 계정(role=ADMIN) 로그인 또는 공유 운영 토큰. 계정 경로가 있어야
  // 백오피스 행위가 사람에게 귀속된다 — 공유 토큰만으로는 누가 했는지 남지 않는다.
  const requireAdmin = createAdminAuth({
    token: env.adminToken,
    lookupUser: async (req) => {
      const token = bearerToken(req);
      const userId = token ? await sessionStore.resolve(token) : undefined;
      return userId ? await userStore.get(userId) : undefined;
    },
  });
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
  const geocoder = createGeocoder();
  app.use(
    '/api',
    createMatchingRouter(async (providerId) => (await reviewStore.ratingSummary(providerId)).average),
  );
  app.use('/api', createUploadsRouter());
  app.use('/api', createRequestsRouter(requestStore, geocoder));
  app.use('/api', createJobsRouter(requestStore, userStore));
  app.use('/api', createAuthRouter(userStore, otpService, sessionStore, credentialStore));
  // 소셜 로그인(카카오/구글/네이버). 자격증명 미설정 시 각 라우트가 503 으로 안내.
  const oauthService = new OAuthService({
    credentials: {
      kakao: {
        clientId: env.oauth.kakao.clientId ?? '',
        clientSecret: env.oauth.kakao.clientSecret ?? '',
      },
      google: {
        clientId: env.oauth.google.clientId ?? '',
        clientSecret: env.oauth.google.clientSecret ?? '',
      },
      naver: {
        clientId: env.oauth.naver.clientId ?? '',
        clientSecret: env.oauth.naver.clientSecret ?? '',
      },
    },
    redirectBase: env.oauth.redirectBase,
    secret: env.oauth.secret,
  });
  app.use(
    '/api',
    createOAuthRouter(userStore, otpService, sessionStore, oauthService, env.oauth.appRedirect),
  );
  app.use(
    '/api',
    createUsersRouter(
      userStore,
      otpService,
      sessionStore,
      credentialStore,
      undefined,
      oauthService,
    ),
  );
  app.use('/api', createReviewsRouter(reviewStore));
  app.use('/api', createQuotesRouter(quoteStore, userStore, requestStore));
  app.use('/api', createPricingRouter(pricingStore));
  // 인테리어 밀봉 역경매 — 플래그가 켜졌을 때만 노출(꺼져 있으면 경로 자체가 404).
  if (env.features.interior) app.use('/api', createInteriorRouter(interiorStore));
  app.use('/api', createOffersRouter(offerStore));
  app.use('/api', createNotificationsRouter(notificationService));
  app.use('/api', createLocationsRouter(new LocationStore(requestStore), geocoder));
  app.use('/api', createChatRouter(new ChatStore(requestStore, notificationService, persistence<ChatMessage>('chat'))));
  // 3D 스캔 실측이 있으면 그걸 쓰고, 없거나 품질 미달이면 연면적 원단위로 폴백한다.
  const volumeEstimator = new ScanVolumeEstimator(new HeuristicVolumeEstimator());
  app.use('/api', createEstimationRouter(volumeEstimator));
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
  // 사진이 여러 장이면 한 장씩 따로 돌려 검출률로 신뢰도를 매긴다(모델 자가보고 대신).
  const consensusSiteAnalyzer = new ConsensusSiteAnalyzer(siteAnalyzer, env.ai.visionConsensus);
  // 3D 현장 스캔 — 복원 서버가 설정돼 있으면 실제, 없으면 목(GPU 없이 전 경로 검증 가능).
  const scan3dQueue = new Scan3DQueue();
  const reconstructor = env.ai.scan3dBaseUrl
    ? new HttpReconstructor({
        baseUrl: env.ai.scan3dBaseUrl,
        apiKey: env.ai.scan3dApiKey,
        timeoutMs: env.ai.scan3dTimeoutMs,
      })
    : new MockReconstructor();
  const siteAnalysisQueue = new SiteAnalysisQueue();
  const siteAnalysisStore = new SiteAnalysisStore(persistence<SiteAnalysisRecord>('site-analysis'));
  app.use(
    '/api',
    createSiteAnalysisRouter(consensusSiteAnalyzer, mockSiteAnalyzer, siteAnalysisQueue, siteAnalysisStore, volumeEstimator),
  );
  app.use('/api', createScan3DRouter(scan3dQueue, reconstructor));
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
      requireAdmin,
    ),
  );

  // SPA 폴백 — /api 외 GET 요청은 Expo 웹 앱 진입점으로(클라이언트 라우팅 지원).
  app.get(/^(?!\/api(\/|$)).*/, (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(join(webDir, 'index.html'));
  });

  // 404 — 정의되지 않은 경로(주로 /api/* 미매칭).
  app.use((_req, res) => {
    res.status(404).json({ error: '요청한 리소스를 찾을 수 없습니다.' });
  });

  // 주기 작업 — 재시도 큐 처리와 정산 대상 점검.
  // 이게 없으면 둘 다 관리자가 매일 손으로 눌러야 돌아간다. 안 누르면 전자인계서가
  // 큐에 쌓인 채 미신고로 남고, 정산 대상도 아무도 모른다.
  if (env.schedulerEnabled) {
    startScheduler([
      createRetryTask({ client: createAllbaroClient() }),
      createSettlementTask({ requestStore }),
    ]);
  }

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
