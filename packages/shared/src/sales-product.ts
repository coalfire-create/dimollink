import { MEMBER_PLATFORM_FEE_RATE, PLATFORM_FEE_RATE } from './constants.js';
import type { UserType } from './user.js';

/**
 * 실판매 상품 — 앱 안에서 실제로 결제할 수 있는 상품 정의.
 *
 * PG(카드사) 심사는 "심사 링크에서 실제로 결제되는 상품"을 요구한다. 매칭 선결제는
 * 금액이 건마다 달라 심사자가 그대로 결제해 볼 수 없으므로, **가격이 고정된 상품**을
 * 따로 둔다.
 *
 * 심사 요건(이 파일이 지키는 것):
 *  - 정기결제는 **월 단위만**. 다른 주기는 타입에 없다.
 *  - 일반결제는 **서비스 제공기간 명시 필수**(결제 후 서비스 완료까지). 타입에서 강제한다.
 *  - 결제창이 갈린다: 일반결제=일반결제창, 정기결제=정기결제창(빌링키 발급).
 *    이건 화면 쪽 규칙이라 [[PORTONE]] 연동부에서 지킨다.
 *  - (토스페이먼츠 심사) 상품 **이미지·금액·상세**가 홈페이지에 노출돼야 하고, 무형 서비스는
 *    **서비스 제공기간·환불 정책**이 필수다. 배송 규정도 확인하므로 "배송 없음"을 명시한다.
 *  - (토스페이먼츠 심사) 서비스 **최대 제공기간은 12개월**을 넘을 수 없다.
 */

/**
 * 서비스 최대 제공기간(개월) — 토스페이먼츠 심사 기준. 이보다 긴 기간을 파는 상품
 * (연간 이용권 등)은 심사에서 반려된다. [[validateSalesProduct]] 가 이 값으로 막는다.
 */
export const MAX_SERVICE_PERIOD_MONTHS = 12;

/** 1개월을 시간으로 — 제공기간 상한 비교용(가장 긴 달 기준이 아니라 30일로 고정). */
const HOURS_PER_MONTH = 30 * 24;

export type BillingType = 'ONE_TIME' | 'MONTHLY_SUBSCRIPTION';

interface SalesProductBase {
  id: string;
  name: string;
  /** 상품 상세 설명. 결제 화면에 그대로 노출된다. */
  description: string;
  /** 판매가(원, VAT 포함). */
  price: number;
  /** 구매 가능한 회원 유형. 비우면 전체. 서버 구독 경로가 이 값으로 막는다. */
  availableTo?: readonly UserType[];
  /** 상품이 제공하는 것 — 화면에 목록으로 띄운다. */
  benefits: readonly string[];
  /**
   * 상품 이미지 — 서버 정적 경로(`apps/api/public/product-images/`). 앱은 API 호스트를
   * 붙여 띄우고, 랜딩 페이지는 그대로 쓴다. 한 파일을 양쪽이 같이 본다.
   */
  imagePath: string;
  /**
   * 서비스 제공기간 — 결제 후 서비스 제공 완료(정기결제는 1회 결제가 덮는 기간)까지.
   * **심사 필수 항목**이라 선택이 아니다. 사람이 읽는 문구와 기계가 쓰는 시간을 함께 둔다.
   */
  servicePeriod: { label: string; hours: number };
  /** 제공 방식(배송 규정). 무형 서비스라 실물 배송이 없다는 점을 명시한다. */
  delivery: string;
  /** 취소·환불 정책 — 화면에 항목별로 그대로 노출한다. 심사 필수 항목. */
  refundPolicy: readonly string[];
}

export interface OneTimeProduct extends SalesProductBase {
  billingType: 'ONE_TIME';
}

export interface MonthlySubscriptionProduct extends SalesProductBase {
  billingType: 'MONTHLY_SUBSCRIPTION';
  /** 결제 주기는 월 1회로 고정한다. 심사 요건상 다른 주기를 두지 않는다. */
  intervalMonths: 1;
  /** 해지 안내 문구. 정기결제는 해지 방법이 명시돼야 한다. */
  cancellationNotice: string;
}

export type SalesProduct = OneTimeProduct | MonthlySubscriptionProduct;

/**
 * 판매 상품 목록.
 *
 * 가격을 코드에 두는 이유는 CLAUDE.md 원칙(비즈니스 상수는 packages/shared)과 같다 —
 * 서버·앱·심사 자료가 같은 값을 봐야 하고, 여기 한 곳만 고치면 전부 따라온다.
 */
/** 철거업체 멤버십 상품 id — 혜택(우선 알림·수수료 인하·상단 노출) 판정이 이 값으로 구독을 찾는다. */
export const DEMOLITION_MEMBERSHIP_ID = 'demolition-membership';

const feePct = (rate: number) => `${Math.round(rate * 100)}%`;

export const SALES_PRODUCTS: readonly SalesProduct[] = [
  {
    id: DEMOLITION_MEMBERSHIP_ID,
    billingType: 'MONTHLY_SUBSCRIPTION',
    name: '철거업체 멤버십 (월 정기결제)',
    description:
      '철거업체 전용 월 구독 상품입니다. 새 철거 견적 요청을 가장 먼저 알림으로 받고, 정산 수수료가 낮아지며, 소비자 홈의 협력 업체 목록 상단에 노출됩니다.',
    price: 5_900,
    imagePath: '/product-images/demolition-membership.png',
    intervalMonths: 1,
    servicePeriod: { label: '결제일로부터 1개월 (매월 자동 갱신)', hours: HOURS_PER_MONTH },
    delivery: '실물 배송 없음 — 결제 즉시 앱에서 혜택이 적용됩니다.',
    cancellationNotice:
      '언제든지 마이페이지 > 스토어 · 멤버십에서 해지할 수 있습니다. 해지 시 다음 결제일부터 청구되지 않으며, 이미 결제된 이용 기간은 끝까지 사용할 수 있습니다.',
    refundPolicy: [
      '결제 후 7일 이내에 혜택(우선 알림 수신·수수료 인하 정산)을 사용하지 않았다면 전액 환불됩니다.',
      '혜택을 사용한 뒤에는 해당 월 요금은 환불되지 않으며, 해지하면 다음 결제부터 청구되지 않습니다.',
      '회사 사정으로 서비스를 제공하지 못한 기간은 일할 계산해 환불합니다.',
    ],
    availableTo: ['DEMOLITION_COMPANY'],
    benefits: [
      '새 철거 견적 요청 우선 알림(문자·앱)',
      `플랫폼 수수료 인하 ${feePct(PLATFORM_FEE_RATE)} → ${feePct(MEMBER_PLATFORM_FEE_RATE)}`,
      '소비자 홈 협력 업체 목록 상단 노출(광고)',
    ],
  },
];

/**
 * 심사 요건 위반 사유 목록(없으면 빈 배열). 상품을 추가·수정할 때 테스트가 이걸로 막는다.
 * 런타임에 거르는 용도가 아니다 — 잘못된 상품은 배포 전에 걸려야 한다.
 */
export function validateSalesProduct(p: SalesProduct): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(p.price) || p.price <= 0) problems.push('가격은 양의 정수(원)여야 합니다.');
  if (!p.imagePath.startsWith('/')) problems.push('이미지 경로가 필요합니다.');
  if (!p.description.trim()) problems.push('상세 설명이 필요합니다.');
  if (!p.servicePeriod.label.trim() || p.servicePeriod.hours <= 0) {
    problems.push('서비스 제공기간이 필요합니다.');
  }
  if (p.servicePeriod.hours > MAX_SERVICE_PERIOD_MONTHS * HOURS_PER_MONTH) {
    problems.push(`서비스 제공기간은 ${MAX_SERVICE_PERIOD_MONTHS}개월을 넘을 수 없습니다.`);
  }
  if (!p.delivery.trim()) problems.push('제공 방식(배송 규정)이 필요합니다.');
  if (p.refundPolicy.length === 0) problems.push('환불 정책이 필요합니다.');
  return problems;
}

/**
 * 지금 결제할 수 있는가.
 *
 * 상품은 항상 노출한다(PG 심사·고객 안내). 다만 정기결제는 PG 의 **자동결제(빌링) 채널**이
 * 따로 있어야 결제창이 열리므로, 채널이 없는 동안에는 "정기결제 준비 중"으로 막는다.
 */
export function isPurchasable(
  product: SalesProduct,
  options: { billingEnabled: boolean },
): boolean {
  return product.billingType === 'ONE_TIME' || options.billingEnabled;
}

/** 이 회원 유형이 살 수 있는 상품인가. */
export function isAvailableTo(product: SalesProduct, userType: UserType): boolean {
  return !product.availableTo || product.availableTo.includes(userType);
}

export function findSalesProduct(id: string): SalesProduct | undefined {
  return SALES_PRODUCTS.find((p) => p.id === id);
}

/** 정기결제 상품만. 결제창이 달라서 화면이 갈라 써야 한다. */
export function monthlySubscriptionProducts(): MonthlySubscriptionProduct[] {
  return SALES_PRODUCTS.filter(
    (p): p is MonthlySubscriptionProduct => p.billingType === 'MONTHLY_SUBSCRIPTION',
  );
}

export function oneTimeProducts(): OneTimeProduct[] {
  return SALES_PRODUCTS.filter((p): p is OneTimeProduct => p.billingType === 'ONE_TIME');
}

/** 구독 상태. */
export type SubscriptionStatus = 'ACTIVE' | 'CANCELLED' | 'PAYMENT_FAILED';

export interface Subscription {
  id: string;
  userId: string;
  productId: string;
  status: SubscriptionStatus;
  /**
   * 빌링키 — 정기결제창에서 발급받은 값. **카드번호가 아니다**(PG가 보관하고 우리는
   * 참조만 한다). 그래도 결제를 일으킬 수 있는 값이라 응답으로 내보내지 않는다.
   */
  billingKey: string;
  /** 다음 결제 예정일(YYYY-MM-DD, KST). */
  nextBillingDate: string;
  /** 이번 이용 기간의 종료일. 해지해도 이 날까지는 쓸 수 있다. */
  currentPeriodEnd: string;
  startedAt: string;
  cancelledAt?: string;
  /** 마지막 결제 실패 사유(코드/요약). 카드 정보는 담지 않는다. */
  lastError?: string;
}

/**
 * 응답으로 내보낼 수 있는 형태 — 빌링키를 뺀다.
 * 카드번호는 아니지만 이 값이면 결제를 일으킬 수 있어 앱에 내려보내지 않는다.
 */
export function toSafeSubscription(sub: Subscription): Omit<Subscription, 'billingKey'> {
  const safe: Record<string, unknown> = { ...sub };
  delete safe.billingKey;
  return safe as Omit<Subscription, 'billingKey'>;
}

/**
 * 다음 달 같은 날(YYYY-MM-DD).
 *
 * 말일을 그냥 더하면 1/31 → 3/3 으로 밀려 결제일이 달마다 어긋난다. 다음 달에 같은
 * 날짜가 없으면 그 달의 마지막 날로 맞춘다(1/31 → 2/28).
 */
export function addOneMonth(date: string): string {
  const parts = date.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const targetMonth = month === 12 ? 1 : month + 1;
  const targetYear = month === 12 ? year + 1 : year;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

/**
 * 오늘 결제해야 하는 구독인가.
 *
 * 결제 실패(PAYMENT_FAILED)도 대상에 넣는다 — 카드 한도 초과·일시 승인거절은 흔하고
 * 대개 며칠 안에 풀린다. 여기서 빼면 한 번 실패한 구독이 영영 재시도되지 않는다.
 * 해지(CANCELLED)만 제외한다.
 */
export function isBillingDue(sub: Subscription, todayKst: string): boolean {
  if (sub.status === 'CANCELLED') return false;
  return sub.nextBillingDate <= todayKst;
}

/** ISO 시각 → 'YYYY-MM-DD'(KST). */
function kstDateOf(iso: string): string {
  return new Date(Date.parse(iso) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 이 구독이 `date`(YYYY-MM-DD, KST)에 혜택을 주는가.
 *
 * 기준은 **결제로 덮인 기간**이다: 시작일 ≤ date < 이번 이용 기간 종료일.
 * - 해지해도 이미 결제한 기간은 끝까지 혜택이 유지된다(해지 안내 문구와 같은 약속).
 * - 결제 실패가 이어져 기간이 갱신되지 않으면 종료일이 지나는 순간 혜택이 끝난다.
 */
export function subscriptionCoversDate(sub: Subscription, date: string): boolean {
  return kstDateOf(sub.startedAt) <= date && date < sub.currentPeriodEnd;
}

/** 멤버십 회원 여부에 따른 플랫폼 수수료율. 정산 금액 계산의 단일 원천. */
export function platformFeeRateFor(options: { member: boolean }): number {
  return options.member ? MEMBER_PLATFORM_FEE_RATE : PLATFORM_FEE_RATE;
}
