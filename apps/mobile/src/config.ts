/**
 * 앱 공개 설정값 — 시크릿 아님(프론트에 심어도 되는 값만 둔다).
 * ⚠️ API Secret·웹훅 시크릿 등은 절대 여기 두지 않는다(서버 .env 전용).
 */

/**
 * PortOne(포트원) 결제 — 앱 SDK requestPayment 에 쓰는 공개값.
 *
 * ⚠️ **정답은 서버에 있다.** 앱은 `GET /api/payments/config`(= Railway 의
 * `PORTONE_STORE_ID` / `PORTONE_CHANNEL_KEY`)로 받은 값을 쓰고, 아래는 그 조회가
 * 실패했을 때만 쓰는 **폴백**이다(`lib/payment-config.ts`). PG·채널을 바꿀 때는
 * 여기가 아니라 서버 환경변수를 바꾼다 — 그래야 웹 번들을 다시 빌드하지 않아도 되고,
 * 서버가 결제 검증에 쓰는 상점과 어긋날 일이 없다.
 *
 * 아래는 테스트 채널(토스페이먼츠, 연동모드=테스트) 값.
 */
export const PORTONE = {
  storeId: 'store-2b221062-c6a9-4862-9fc2-558e6f8999dc',
  /** 토스페이먼츠 테스트 채널(일반결제 · V2). */
  channelKey: 'channel-key-df6f3d50-a596-4120-a43f-910863cbc9b4',
} as const;
