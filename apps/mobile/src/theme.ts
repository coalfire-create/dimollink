import {
  APP_BACKGROUND,
  COLORS,
  FONT_SIZES,
  GLYPH_SIZES,
  MAX_CONTENT_WIDTH,
  SPACING,
  STATUS_COLORS,
  TAB_LABEL_FONT_SIZE,
  TOUCH,
} from '@dimol/shared';

/**
 * 앱 전역 디자인 테마 — 값의 단일 소스는 @dimol/shared 디자인 토큰.
 * (기본 텍스트 18px+, 제목 24px+, 버튼 48px+, 여백 8px 배수, 메인+보조 2색)
 * 화면/컴포넌트에서 크기·색을 직접 하드코딩하지 않는다.
 */
export const theme = {
  colors: { ...COLORS, ...STATUS_COLORS, appBackground: APP_BACKGROUND },
  font: { ...FONT_SIZES, tabLabel: TAB_LABEL_FONT_SIZE },
  /** 기호(✓ × ▾) 전용 크기 — 읽는 글자에는 쓰지 않는다. */
  glyph: GLYPH_SIZES,
  spacing: SPACING,
  touch: TOUCH,
  /** 웹에서 데스크톱 폭으로 늘어나지 않게 잡아주는 본문 최대 폭. */
  maxContentWidth: MAX_CONTENT_WIDTH,
  /**
   * 우하단 고객센터 플로팅 버튼이 마지막 콘텐츠를 가리지 않도록
   * 스크롤 영역 맨 아래에 확보해야 하는 여백(버튼 56 + 아래 여백).
   */
  floatingButtonClearance: 88,
  radius: {
    card: 20,
    button: 16,
    badge: 999,
    pill: 999,
  },
  /** 그림자 프리셋 — 하드한 테두리 대신 은은한 입체감(대기업 앱 톤). */
  shadow: {
    /** 카드·시트 기본 그림자. */
    card: {
      shadowColor: STATUS_COLORS.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    /** 주요 버튼 강조 그림자(브랜드 색). */
    primary: {
      shadowColor: COLORS.primary,
      shadowOpacity: 0.3,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
  },
} as const;

/**
 * 요청 상태 → 배지 색.
 *
 * 무채색(접수 전) → 브랜드 블루(진행 중) → 초록(끝남) → 빨강(취소) 네 단계.
 * 진행 중과 완료를 같은 파랑으로 두면 목록에서 구분이 안 돼 상태색을 쓴다
 * (상태 토큰은 뜻이 있을 때만 — [[design-tokens]] STATUS_COLORS 주석 참고).
 */
export function statusColor(status: string): { background: string; text: string } {
  switch (status) {
    case 'REQUESTED':
      return { background: theme.colors.surface, text: theme.colors.textMuted };
    case 'MATCHED':
    case 'PAID':
    case 'IN_PROGRESS':
      return { background: theme.colors.primarySoft, text: theme.colors.primary };
    case 'COMPLETED':
    case 'SETTLED':
      return { background: theme.colors.successSoft, text: theme.colors.success };
    // 멈춰 있어 사용자가 손을 써야 하는 상태(취소·결제 대기)는 같은 톤으로 묶는다.
    case 'CANCELLED':
    case 'PAYMENT_DUE':
      return { background: theme.colors.errorSoft, text: theme.colors.error };
    default:
      return { background: theme.colors.surface, text: theme.colors.textMuted };
  }
}
