/**
 * 앱 공개 설정값 — 시크릿 아님(프론트에 심어도 되는 값만 둔다).
 * ⚠️ API Secret·웹훅 시크릿 등은 절대 여기 두지 않는다(서버 .env 전용).
 */

/**
 * PortOne(포트원) 결제 — 앱 SDK requestPayment 에 쓰는 공개값.
 * storeId·channelKey 는 클라이언트 노출용 값이라 코드에 두어도 된다.
 * 아래는 테스트 채널(토스페이먼츠, 연동모드=테스트) 값. 운영 전환 시 실채널 값으로 교체.
 */
export const PORTONE = {
  storeId: 'store-2b221062-c6a9-4862-9fc2-558e6f8999dc',
  /** 토스페이먼츠 테스트 채널(일반결제 · V2). */
  channelKey: 'channel-key-df6f3d50-a596-4120-a43f-910863cbc9b4',
} as const;
