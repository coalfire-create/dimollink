/**
 * 백엔드 API 클라이언트 — 도메인별 모듈의 진입점(배럴).
 *
 * 예전에는 이 파일 하나에 모든 호출이 들어 있었다(700줄). 화면이 늘어날수록 관련 없는
 * 코드를 스크롤해 지나가야 했고, 같은 도메인의 함수가 파일 여기저기에 흩어졌다
 * (관리자 호출이 중간과 맨 끝에 나뉘어 있었다).
 *
 * 지금은 도메인별로 나뉘어 있고 여기서 다시 모아 내보낸다. 화면 쪽 import 경로
 * (`../api/client`)는 그대로라 호출부를 건드리지 않는다. 새 도메인이 생기면
 * 파일을 하나 추가하고 여기에 한 줄 더한다.
 *
 * 공통 인프라(베이스 URL·인증 헤더·401 처리)는 [[http]] 한 곳에만 있다.
 */
export * from './http';

export * from './auth';
export * from './providers';
export * from './requests';
export * from './notifications';
export * from './vision';
export * from './quotes';
export * from './payments';
export * from './interior';
export * from './admin';
export * from './reviews';
export * from './uploads';
export * from './scan3d';
