import { COLORS, FONT_SIZES, SPACING, TOUCH } from '@dimol/shared';

/**
 * 앱 전역 디자인 테마 — 값의 단일 소스는 @dimol/shared 디자인 토큰.
 * (기본 텍스트 18px+, 제목 24px+, 버튼 48px+, 여백 8px 배수, 메인+보조 2색)
 * 화면/컴포넌트에서 크기·색을 직접 하드코딩하지 않는다.
 */
export const theme = {
  colors: COLORS,
  font: FONT_SIZES,
  spacing: SPACING,
  touch: TOUCH,
  radius: {
    card: 16,
    button: 16,
    badge: 8,
  },
} as const;

/** 요청 상태 → 배지 색 (메인/보조/오류/무채색만 사용 — 색 남발 금지). */
export function statusColor(status: string): { background: string; text: string } {
  switch (status) {
    case 'REQUESTED':
      return { background: theme.colors.surface, text: theme.colors.textMuted };
    case 'MATCHED':
    case 'PAID':
    case 'IN_PROGRESS':
      return { background: '#FDF3E3', text: '#8A5A00' }; // 보조색 계열 연한 배경
    case 'COMPLETED':
    case 'SETTLED':
      return { background: '#E7F3EC', text: theme.colors.primary }; // 메인색 계열 연한 배경
    case 'CANCELLED':
      return { background: '#FBEAEA', text: theme.colors.error };
    default:
      return { background: theme.colors.surface, text: theme.colors.textMuted };
  }
}
