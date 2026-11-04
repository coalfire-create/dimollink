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
  WIDE_CONTENT_WIDTH,
  WIDE_FORM_WIDTH,
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
  /** 데스크톱 웹 화면 폭 — 홈·목록(wideContent) / 폼·상세(wideForm). [[useWideLayout]] */
  wideContentWidth: WIDE_CONTENT_WIDTH,
  wideFormWidth: WIDE_FORM_WIDTH,
  /**
   * 우하단 고객센터 플로팅 버튼이 마지막 콘텐츠를 가리지 않도록
   * 스크롤 영역 맨 아래에 확보해야 하는 여백(버튼 56 + 아래 여백).
   */
  floatingButtonClearance: 88,
  /**
   * 모서리 — 20/16 처럼 크게 굴리면 템플릿 앱처럼 보여서 8~12 로 낮췄다.
   * 배지는 알약(999) 대신 살짝 각진 태그(6)로 둔다.
   */
  radius: {
    card: 12,
    button: 10,
    badge: 6,
    pill: 999,
  },
  /**
   * 그림자 — 카드는 테두리로 경계를 잡고 그림자는 거의 쓰지 않는다(야외 시인성은
   * 테두리가 더 낫다). 버튼에 브랜드 색 번짐(glow)을 주던 것은 뺐다.
   */
  shadow: {
    /** 카드·시트 기본 그림자 — 테두리 보조용으로 아주 옅게. */
    card: {
      shadowColor: STATUS_COLORS.shadow,
      shadowOpacity: 0.04,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    /** 주요 버튼 — 평면. 키는 남겨 두어 기존 호출부가 깨지지 않게 한다. */
    primary: {
      shadowColor: 'transparent',
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
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
