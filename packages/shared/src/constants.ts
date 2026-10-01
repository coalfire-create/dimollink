/**
 * 플랫폼 핵심 비즈니스 상수.
 *
 * ⚠️ CLAUDE.md「핵심 비즈니스 규칙」에 따라 이 값들은 임의로 바꾸지 않는다.
 * 수수료율 등은 반드시 이 파일에서만 관리하고 코드 곳곳에 하드코딩하지 않는다.
 */

/** 플랫폼 수수료율 7% (Phase 0에서 확정한 초기값). */
export const PLATFORM_FEE_RATE = 0.07;

/**
 * 철거업체 멤버십(월 정기결제) 회원의 플랫폼 수수료율 5%.
 *
 * 멤버십 혜택 중 하나다([[sales-product]] demolition-membership). 회원이 받는 거래의
 * 정산 시 PLATFORM_FEE_RATE 대신 이 값을 쓴다 — 결제자가 내는 금액은 같고, 업체
 * 수령액만 늘어난다. 적용 여부는 서버가 처리완료일 기준 멤버십 기간으로 판단한다.
 */
export const MEMBER_PLATFORM_FEE_RATE = 0.05;

/**
 * 취소 위약금율 10%.
 * 배차 후 ~ 작업 시작 전 취소 시 선결제액에서 이 비율을 공제하고 환불한다.
 * (배차 전 취소는 전액 환불, 작업 시작 후에는 원칙적으로 취소 불가.)
 */
export const CANCELLATION_PENALTY_RATE = 0.1;

/** 정산 주기: 익영업일(D+1). 수수료 제외 금액을 운반업체/처리장에 지급. */
export const SETTLEMENT_DELAY_BUSINESS_DAYS = 1;

/** 올바로 전자인계서 의무신고 기준: 건설폐기물 5톤 이상. */
export const ALLBARO_MANDATORY_CONSTRUCTION_WASTE_TON = 5;

/**
 * 공통 매칭 반경 30km.
 * 배출 현장(상차지) 기준 이 반경 이내의 업체만 후보로 노출하고, 신규 요청 알림도
 * 이 반경 안에서만 발송한다. (반경 조정 시 이 상수만 수정하고 하드코딩하지 않는다.)
 */
export const MATCH_RADIUS_KM = 30;

/**
 * 신규 운반요청 "콜" 알림을 받는 업체 수 상한(가까운 순).
 *
 * 반경 안 전원에게 보내면 업체가 늘어난 만큼 **요청 1건당 문자 비용이 그대로 곱해진다**
 * (알림이 문자로 나가기 전에는 로그뿐이라 공짜였다). 받는 쪽도 못 잡을 콜까지 계속
 * 받으면 수신거부를 눌러 정작 중요한 알림을 놓친다.
 *
 * 일감 목록에는 반경 안 전원에게 그대로 보이므로 매칭 기회가 줄지는 않는다 —
 * 줄어드는 것은 "먼저 알려주는" 대상뿐이다.
 */
export const TRANSPORT_CALL_FANOUT_LIMIT = 20;

/** 고객센터 대표 전화번호(표시용). 문의 화면·고객센터 버튼에서 노출한다. */
export const SUPPORT_PHONE = '070-4577-7960';

/** 고객센터 전화 연결용 tel: URL(숫자만). Linking.openURL 에 사용. */
export const SUPPORT_PHONE_TEL_URL = 'tel:07045777960';

/** 파일럿 범위 (이 범위를 벗어난 기능은 로드맵의 지정 Phase 전까지 만들지 않는다). */
export const PILOT = {
  region: '양평',
  wasteCategory: 'CONSTRUCTION',
} as const;

/**
 * 사업자 정보(전자상거래법 제10조 표시사항).
 *
 * 통신판매중개 사업자는 상호·대표자·주소·사업자등록번호·통신판매업신고번호를
 * 소비자가 쉽게 볼 수 있는 곳에 표시해야 한다. 토스페이먼츠 가맹 심사도 홈페이지 하단에
 * 사업자 정보와 **고객센터 전화번호**를 요구하고, 값이 **사업자등록증과 일치**해야 한다.
 * 그래서 첫 화면·마이페이지·랜딩(/landing)·약관 페이지가 모두 이 값 하나를 본다.
 *
 * 값이 비어 있으면 푸터가 해당 줄을 숨긴다 — 없는 번호를 지어내 띄우는 것이 표시
 * 누락보다 나쁘다. 통신판매업 신고번호는 신고 완료 후 채운다.
 */
export const COMPANY_INFO = {
  /** 상호 — 사업자등록증 표기 그대로. */
  name: '디몰링크(DEMOLINK)',
  serviceName: '비움',
  /** 대표자 성명. */
  representative: '허재원',
  /** 사업장 주소. */
  address: '경기도 양평군 양평읍 안골길 22',
  /** 사업자등록번호. */
  businessNumber: '508-15-03674',
  /** 통신판매업 신고번호. 신고 완료 전에는 비워 둔다(푸터에서 숨김). */
  mailOrderNumber: '',
  /** 개인정보 보호책임자. */
  privacyOfficer: '허재원',
  /** 고객 문의 이메일. */
  email: 'demolink@naver.com',
  /** 고객센터 전화 — [[SUPPORT_PHONE]] 과 같은 값. */
  supportPhone: SUPPORT_PHONE,
} as const;
