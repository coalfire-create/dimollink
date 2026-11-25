/**
 * 접근성 디자인 토큰 (로드맵 Phase 6 · CLAUDE.md 디자인 기준).
 * 고령 사용자 기준: 큰 글씨, 넉넉한 터치 영역, 8px 배수 여백, 절제된 색.
 * UI(React Native)는 크기·색을 하드코딩하지 말고 반드시 이 토큰을 쓴다.
 */

/**
 * 글자 크기(px). 기본 텍스트 18 이상, 제목 24 이상 — 이보다 작게 쓰지 않는다.
 *
 * 화면에서 12~14px 을 직접 박아 쓰던 자리(칩·태그·탭 라벨 등)가 고령 사용자에게
 * 읽히지 않아 전부 이 토큰으로 올렸다. "작게 보이는 글씨"가 필요하면 크기를 줄이지
 * 말고 색(textMuted)·굵기로 위계를 만든다.
 */
export const FONT_SIZES = {
  /** 보조 정보(캡션)도 최소 기준을 지킨다. */
  caption: 18,
  body: 18,
  bodyLarge: 20,
  title: 24,
  titleLarge: 28,
  /**
   * 데스크톱 웹 홈페이지 전용 큰 제목 — 첫 화면 대표 문구·섹션 제목.
   * 앱(좁은 화면)에서는 쓰지 않는다. 넓은 화면에서 28px 제목은 본문과 구분이 안 돼
   * "폼 하나 띄워 둔 페이지"처럼 보였다.
   */
  display: 36,
  hero: 52,
} as const;

/**
 * 자간 — 제목은 살짝 좁혀야 한글 굵은 글씨가 덩어리로 읽힌다(큰 서비스들이 쓰는 방식).
 * 본문에는 쓰지 않는다(18px 본문을 좁히면 고령 사용자에게 오히려 답답하다).
 */
export const LETTER_SPACING = {
  /** 24~28px 제목. */
  title: -0.4,
  /** 36px 이상 홈페이지 제목. */
  display: -1,
} as const;

/**
 * 하단 탭 라벨 전용 크기.
 *
 * 탭은 한 줄에 최대 4개가 들어가야 해서 본문(18)을 그대로 쓰면 작은 화면(360px)에서
 * 라벨이 잘린다. 아이콘이 항상 같이 있어 글자만으로 뜻을 읽을 필요가 없는 자리라
 * 유일하게 16px 을 허용하고, 그 대신 라벨을 4글자 이하로 유지한다.
 */
export const TAB_LABEL_FONT_SIZE = 16;

/**
 * 기호(✓ × ▾ 같은 글리프) 크기.
 *
 * 18px 하한은 **읽는 글자**에 대한 규칙이다. 체크박스 안의 ✓ 나 셀렉트의 ▾ 는
 * 글자가 아니라 아이콘이라, 크기를 본문에 맞추면 상자 밖으로 삐져나온다.
 * 그렇다고 화면마다 13·14 를 박아 쓰면 규칙을 어긴 건지 아닌지 구분이 안 되므로
 * "여기 있는 값만 기호에 쓴다"로 정리했다. 글자에는 절대 쓰지 않는다.
 */
export const GLYPH_SIZES = {
  /** 체크박스·라디오 안의 ✓, 셀렉트의 ▾. */
  inline: 16,
  /** 썸네일 삭제 × 처럼 더 작은 상자 안에 들어가는 기호. */
  small: 14,
} as const;

/**
 * 본문 최대 폭(px) — 웹(react-native-web)에서 데스크톱 브라우저로 열었을 때
 * 모바일 레이아웃이 1920px 로 늘어나 버리는 것을 막는다. 앱(네이티브)에서는
 * 화면이 이보다 좁아 아무 영향이 없다.
 */
export const MAX_CONTENT_WIDTH = 520;

/**
 * 데스크톱 웹 레이아웃 — 브라우저 폭이 이 값 이상이면 폰 폭 칸 대신 웹 화면으로 그린다
 * (상단 메뉴바 + 넓은 본문 + 카드 그리드). 태블릿 세로(768~)는 모바일 레이아웃이 더 낫다.
 */
export const WIDE_LAYOUT_BREAKPOINT = 1024;
/** 웹 화면 본문 최대 폭 — 홈·목록처럼 카드를 여러 칸으로 펼치는 화면. */
export const WIDE_CONTENT_WIDTH = 1200;
/** 웹 화면 폼·상세 최대 폭 — 입력칸·버튼이 화면 끝까지 늘어나면 읽기 어렵다. */
export const WIDE_FORM_WIDTH = 880;

/** 터치 영역(px). 버튼 높이 최소 48. */
export const TOUCH = {
  minButtonHeight: 48,
  /** 큰 주요 버튼 (결제/매칭 확정 등 핵심 동작). */
  primaryButtonHeight: 56,
  /** 터치 대상 사이 최소 간격. */
  minGap: 8,
} as const;

/** 여백(px) — 8px 배수만 사용한다. */
export const SPACING = {
  xs: 8,
  sm: 16,
  md: 24,
  lg: 32,
} as const;

/** 여백 값이 8px 배수 규칙을 지키는지 검사 (스타일 린트/테스트용). */
export function isValidSpacing(px: number): boolean {
  return Number.isInteger(px) && px >= 0 && px % 8 === 0;
}

/**
 * 색상 — 웜 아키텍처 스톤(Warm Stone) + 딥 블루프린트 코발트 + 현장 오렌지(절제 포인트).
 * 범용 SaaS 블루-그레이 대신 종이/현장 도면 톤의 무채색 바탕을 깔고, 모든 조합이 WCAG AA(4.5:1↑)를 넘긴다.
 */
export const COLORS = {
  /** 메인 — 주요 버튼, 활성 상태. 깊은 블루프린트 코발트(흰 글씨 대비 6.7:1). */
  primary: '#1B64DA',
  /** 메인 진한 톤 — 웹 호버/눌림. */
  primaryDark: '#1957C2',
  /** 메인 연한 톤 — 선택 배경·아주 옅은 강조 틴트. */
  primarySoft: '#E8F3FF',
  /** 보조 — 현장 안전 테라코타 오렌지. 긴급/핵심 주의 포인트에만 절제 사용. */
  secondary: '#D44A1A',
  /** 본문 텍스트 — 따뜻한 숯 먹색(흰 배경 대비 17.5:1). */
  text: '#191F28',
  /** 보조 텍스트 — 흰 배경 7.16:1, 스톤 바닥(#F4F3EE) 6.45:1. */
  textMuted: '#4E5968',
  background: '#FFFFFF',
  /** 카드 안 묶음·입력창 기본 배경 — 웜 아이보리 스톤. */
  surface: '#F9FAFB',
  /** 카드·구분선 — 차가운 회색 대신 따뜻한 스톤 보더. */
  border: '#E5E8EB',
  /** 입력칸·보조 버튼 테두리 — 누르는 경계를 또렷하게 잡는 스톤 그레이. */
  borderStrong: '#D1D6DB',
  /** 오류/필수 경고 전용. */
  error: '#B91C1C',
} as const;

/**
 * 어두운 띠(홈페이지 하단 사업자 정보·강조 배너) 위 글자색.
 * 바탕은 COLORS.text(먹색)를 그대로 쓴다 — 어두운 색을 하나 더 만들지 않는다.
 */
export const ON_DARK = {
  /** 다크 아키텍처 캔버스 바닥 — 깊은 옵시디언 슬레이트. */
  canvas: '#191F28',
  /** 다크 캔버스 위 카드·패널 표면. */
  surface: '#212833',
  /** 다크 표면 외곽선·헤어라인. */
  border: '#333D4B',
  /** 먹색 바탕 위 본문(14.1:1). */
  text: '#E5E8EB',
  /** 먹색 바탕 위 보조 글자(7.5:1). */
  textMuted: '#B0B8C1',
  /** 먹색 바탕 위 구분선. */
  divider: '#333D4B',
} as const;

/**
 * 화면 배경(카드가 떠 있는 바닥) — 웜 스톤(#F4F3EE) 바닥 위에 순백 카드가 단정하게 얹힌다.
 */
export const APP_BACKGROUND = '#F2F4F6';

/**
 * 상태 전용 색 — 장식으로 쓰지 않고 성공/주의/오류 신호에만 사용한다.
 */
export const STATUS_COLORS = {
  /** 성공·완료. 흰 배경 및 successSoft 위 AA(4.5:1↑) 통과. */
  success: '#146C43',
  successSoft: '#EAF5EF',
  successOnDark: '#4ADE80',
  /** 주의·확인 필요. */
  warning: '#8C4A08',
  warningSoft: '#FDF3E6',
  warningOnDark: '#FCD34D',
  /** 오류 배경 — 글자색은 COLORS.error 를 쓴다. */
  errorSoft: '#FDECEC',
  errorOnDark: '#FCA5A5',
  /** 카메라·모달 뒤를 덮는 막. */
  scrim: 'rgba(0,0,0,0.72)',
  /** 카메라 촬영·3D 뷰어처럼 화면 전체가 어두운 배경. */
  cameraBackground: '#000000',
  viewerBackground: '#101418',
  /** 그림자 색 — 먹색 기반. */
  shadow: '#17191C',
} as const;
