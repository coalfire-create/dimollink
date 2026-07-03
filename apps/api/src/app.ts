import cors from 'cors';
import express from 'express';
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
import { env } from './config/env.js';
import { JsonCollectionFile } from './lib/json-collection.js';
import { AnomalyDetector } from './anomaly/detect.js';
import { ChatStore } from './chat/store.js';
import { HeuristicVolumeEstimator } from './estimation/provider.js';
import { LocationStore } from './locations/store.js';
import { ConsoleNotificationProvider } from './notifications/provider.js';
import { NotificationService } from './notifications/service.js';
import { OfferStore } from './offers/store.js';
import { QuoteStore } from './quotes/store.js';
import { RequestStore } from './requests/store.js';
import { ReviewStore } from './reviews/store.js';
import { UserStore } from './users/store.js';
import { OtpService } from './auth/otp-service.js';
import { SessionTokenStore } from './auth/session-store.js';
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

/** Express 앱 구성 (서버 기동과 분리해 테스트에서 재사용 가능). */
export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api', healthRouter);
  app.use('/api', createAllbaroRouter());
  app.use('/api', createPaymentsRouter());
  const notificationService = new NotificationService(
    new ConsoleNotificationProvider(),
    new JsonCollectionFile<AppNotification>(env.dataDir, 'notifications.json'),
  );
  const requestStore = new RequestStore(
    new JsonCollectionFile<ServiceRequest>(env.dataDir, 'requests.json'),
    (request) => notificationService.notifyStatusChange(request),
  );
  const userStore = new UserStore(new JsonCollectionFile<UserProfile>(env.dataDir, 'users.json'));
  // 휴대폰 OTP + 세션 토큰(자동 로그인) — 파일럿은 메모리 보관, 서버 재시작 시 초기화.
  const otpService = new OtpService();
  const sessionStore = new SessionTokenStore();
  const reviewStore = new ReviewStore(
    requestStore,
    new JsonCollectionFile<Review>(env.dataDir, 'reviews.json'),
    new JsonCollectionFile<Incident>(env.dataDir, 'incidents.json'),
  );
  const quoteStore = new QuoteStore(
    requestStore,
    new JsonCollectionFile<Quote>(env.dataDir, 'quotes.json'),
  );
  const offerStore = new OfferStore(
    requestStore,
    new JsonCollectionFile<MatchOffer>(env.dataDir, 'offers.json'),
  );

  app.use('/api', createMatchingRouter((providerId) => reviewStore.ratingSummary(providerId).average));
  app.use('/api', createUploadsRouter());
  app.use('/api', createRequestsRouter(requestStore));
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
    createChatRouter(
      new ChatStore(requestStore, new JsonCollectionFile<ChatMessage>(env.dataDir, 'chat.json')),
    ),
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

  return app;
}
