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
 */

export type BillingType = 'ONE_TIME' | 'MONTHLY_SUBSCRIPTION';

interface SalesProductBase {
  id: string;
  name: string;
  /** 상품 상세 설명. 결제 화면에 그대로 노출된다. */
  description: string;
  /** 판매가(원, VAT 포함). */
  price: number;
  /** 구매 가능한 회원 유형. 비우면 전체. */
  availableTo?: readonly ('CONSUMER' | 'PROVIDER')[];
  /** 상품이 제공하는 것 — 화면에 목록으로 띄운다. */
  benefits: readonly string[];
}

export interface OneTimeProduct extends SalesProductBase {
  billingType: 'ONE_TIME';
  /**
   * 서비스 제공기간 — 결제 후 서비스 제공 완료까지. **심사 필수 항목**이라 선택이 아니다.
   * 사람이 읽는 문구와 기계가 쓰는 시간을 함께 둔다(환불 기준 계산에 쓴다).
   */
  servicePeriod: { label: string; hours: number };
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
export const SALES_PRODUCTS: readonly SalesProduct[] = [
  {
    id: 'vision-report',
    billingType: 'ONE_TIME',
    name: '디몰비전 현장 분석 리포트',
    description:
      '현장 사진을 올리면 AI가 자재·철거 공정·예상 폐기물량을 분석해 리포트로 만들어 드립니다. 건축물대장(공공데이터)을 함께 조회해 구조·연면적을 반영합니다.',
    price: 9_900,
    servicePeriod: { label: '결제 후 24시간 이내 리포트 제공', hours: 24 },
    benefits: [
      '자재 종류별 예상 물량(톤) 산출',
      '철거 공정 순서와 안전 유의사항',
      '올바로 전자인계서 의무 대상 여부 판정',
      '건축물대장 기반 구조·연면적 반영',
    ],
  },
  {
    id: 'provider-membership',
    billingType: 'MONTHLY_SUBSCRIPTION',
    name: '업체 멤버십 (월 정기결제)',
    description:
      '철거·운반·처리 업체를 위한 월 구독 상품입니다. 새 요청 알림을 우선으로 받고, 개산 견적을 제한 없이 제출할 수 있습니다.',
    price: 49_000,
    intervalMonths: 1,
    cancellationNotice:
      '언제든지 마이페이지 > 멤버십에서 해지할 수 있습니다. 해지 시 다음 결제일부터 청구되지 않으며, 이미 결제된 이용 기간은 끝까지 사용할 수 있습니다.',
    availableTo: ['PROVIDER'],
    benefits: [
      '새 요청 알림 우선 수신',
      '개산 견적 제출 무제한',
      '업체 프로필에 멤버십 배지 노출',
      '개산 정확도 리포트 제공',
    ],
  },
];

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
