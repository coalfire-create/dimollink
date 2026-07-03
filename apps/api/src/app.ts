import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import type {
  AppNotification,
  ChatMessage,
  Incident,
  MatchOffer,
  Quote,
  Review,
  ServiceRequest,
  UserProfile,
} from '@dimol/shared';
import type { PersistedSession } from './auth/session-store.js';
import { env } from './config/env.js';
import { jsonPersistenceFactory, type PersistenceFactory } from './lib/json-collection.js';
import { AnomalyDetector } from './anomaly/detect.js';
import { ChatStore } from './chat/store.js';
import { HeuristicVolumeEstimator } from './estimation/provider.js';
import { LocationStore } from './locations/store.js';
import { ConsoleNotificationProvider } from './notifications/provider.js';
import { NotificationService } from './notifications/service.js';
import { OfferStore } from './offers/store.js';
import { PaymentStore, type PaymentRecord } from './payment/payment-store.js';
import { QuoteStore } from './quotes/store.js';
import { RequestStore } from './requests/store.js';
import { ReviewStore } from './reviews/store.js';
import { UserStore } from './users/store.js';
import { OtpService } from './auth/otp-service.js';
import { SessionTokenStore } from './auth/session-store.js';
import { createSmsSender } from './auth/sms-sender.js';
import { createGeocoder } from './geo/geocoder.js';
import { createAdminAuth } from './middleware/admin-auth.js';
import { createRequireAuth } from './middleware/auth.js';
import { createRateLimiter, requestLogger, securityHeaders } from './middleware/security.js';
import { createAllbaroRouter } from './routes/allbaro.js';
import { createAuthRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { createMatchingRouter } from './routes/matching.js';
import { createPaymentsRouter } from './routes/payments.js';
import { createAdminRouter } from './routes/admin.js';
import { createChatRouter } from './routes/chat.js';
import { createEstimationRouter } from './routes/estimation.js';
import { createJobsRouter } from './routes/jobs.js';
import { createLocationsRouter } from './routes/locations.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createOffersRouter } from './routes/offers.js';
import { createQuotesRouter } from './routes/quotes.js';
import { createRequestsRouter } from './routes/requests.js';
import { createReviewsRouter } from './routes/reviews.js';
import { createUploadsRouter } from './routes/uploads.js';
import { createUsersRouter } from './routes/users.js';

/**
 * Express 앱 구성 (서버 기동과 분리해 테스트에서 재사용 가능).
 * persistence 팩토리를 주입해 JSON 파일(기본) 또는 PostgreSQL 로 저장소를 교체한다.
 */
export function createApp(persistence: PersistenceFactory = jsonPersistenceFactory(env.dataDir)) {
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
  app.use(requestLogger());
  app.use(express.json({ limit: '1mb' })); // 과대 페이로드 차단.

  // 인증 엔드포인트 남용(무차별 대입·OTP 폭탄) 방지 — IP 기준 레이트리밋.
  app.use(
    '/api/auth',
    createRateLimiter({
      windowMs: 60_000,
      max: 20,
      message: '인증 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
    }),
  );

  app.use('/api', healthRouter);
  const notificationService = new NotificationService(
    new ConsoleNotificationProvider(),
    persistence<AppNotification>('notifications'),
  );
  const requestStore = new RequestStore(persistence<ServiceRequest>('requests'), (request) =>
    notificationService.notifyStatusChange(request),
  );
  const userStore = new UserStore(persistence<UserProfile>('users'));
  // 휴대폰 OTP + 세션 토큰(자동 로그인) — 파일럿은 메모리 보관, 서버 재시작 시 초기화.
  // devMasterCode 는 비운영 환경에서만 주입된다(운영에서는 undefined → 마스터코드 없음).
  const otpService = new OtpService({
    sender: createSmsSender(),
    ttlMs: env.otp.ttlSec * 1000,
    resendCooldownMs: env.otp.resendCooldownSec * 1000,
    maxAttempts: env.otp.maxAttempts,
    // 운영에서는 마스터 인증코드를 절대 활성화하지 않는다(env 값과 무관한 최종 안전장치).
    devMasterCode: env.isProduction ? undefined : env.otp.devMasterCode,
  });
  // 세션은 영속화해 재시작/배포에도 로그인이 유지되게 한다(파일럿 JSON, 운영은 Redis/DB 교체).
  const sessionStore = new SessionTokenStore({
    ttlMs: env.auth.sessionTtlDays * 24 * 60 * 60 * 1000,
    persistence: persistence<PersistedSession>('sessions'),
  });
  const reviewStore = new ReviewStore(
    requestStore,
    persistence<Review>('reviews'),
    persistence<Incident>('incidents'),
  );
  const quoteStore = new QuoteStore(requestStore, persistence<Quote>('quotes'));
  const offerStore = new OfferStore(requestStore, persistence<MatchOffer>('offers'));
  const paymentStore = new PaymentStore(persistence<PaymentRecord>('payments'));

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
  app.use('/api/offers', requireAuth); // 자동매칭 오퍼(Phase 3) — 로그인 필요(오퍼 생성/스윕의 관리자 전용화는 후속)

  // 결제/정산 — 금전 이동. 선결제·취소는 로그인, 지급대행은 관리자/스케줄러 전용.
  const requireAdmin = createAdminAuth(env.adminToken);
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
  app.use('/api', createPaymentsRouter(undefined, requestStore, quoteStore, paymentStore));
  app.use('/api', createMatchingRouter((providerId) => reviewStore.ratingSummary(providerId).average));
  app.use('/api', createUploadsRouter());
  app.use('/api', createRequestsRouter(requestStore, createGeocoder()));
  app.use('/api', createJobsRouter(requestStore, userStore));
  app.use('/api', createAuthRouter(userStore, otpService, sessionStore));
  app.use('/api', createUsersRouter(userStore, otpService, sessionStore));
  app.use('/api', createReviewsRouter(reviewStore));
  app.use('/api', createQuotesRouter(quoteStore));
  app.use('/api', createOffersRouter(offerStore));
  app.use('/api', createNotificationsRouter(notificationService));
  app.use('/api', createLocationsRouter(new LocationStore(requestStore)));
  app.use(
    '/api',
    createChatRouter(new ChatStore(requestStore, persistence<ChatMessage>('chat'))),
  );
  app.use('/api', createEstimationRouter(new HeuristicVolumeEstimator()));
  app.use(
    '/api',
    createAdminRouter(
      {
        userStore,
        reviewStore,
        requestStore,
        offerStore,
        anomalyDetector: new AnomalyDetector(requestStore, quoteStore),
      },
      env.adminToken,
    ),
  );

  // 404 — 정의되지 않은 경로.
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
