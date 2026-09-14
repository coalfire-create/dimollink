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
 * 색상 — 브랜드(비움) 로고 팔레트. 메인 1개(블루) + 보조 1개(스카이블루)로 제한.
 * 그 외는 무채색과 상태색(오류)만 허용한다. 텍스트/배경은 고대비 유지.
 * 메인 블루(#2C55E9)는 흰 텍스트와 대비 5.86:1 로 WCAG AA(4.5:1)를 만족한다.
 */
export const COLORS = {
  /** 메인 — 주요 버튼, 활성 상태. 로고 워드마크 딥블루. */
  primary: '#2C55E9',
  /** 메인 진한 톤 — 눌림/헤더/그라데이션 하단. */
  primaryDark: '#193CB5',
  /** 메인 연한 톤 — 선택·강조 배경(연한 브랜드 틴트). */
  primarySoft: '#EAEFFD',
  /** 보조 — 로고 오렌지색. 강조 배지·아이콘 포인트. */
  secondary: '#FF5D28',
  /** 본문 텍스트 (흰 배경 대비 15.3:1). */
  text: '#1A1A1A',
  /** 보조 텍스트 — 대비 4.5:1 이상 유지. */
  textMuted: '#595959',
  background: '#FFFFFF',
  /** 카드·섹션 배경 — 아주 옅은 블루그레이(브랜드 톤). */
  surface: '#F6F7F9',
  border: '#DCE3F0',
  /** 오류/필수 경고 전용. */
  error: '#C62828',
} as const;

/**
 * 화면 배경(카드가 떠 있는 바닥) — 카드는 흰색이라 바닥은 그보다 한 톤 어둡다.
 * 화면마다 '#F2F4F6' 을 직접 박아 쓰던 것을 여기로 모았다.
 */
export const APP_BACKGROUND = '#F2F4F6';

/**
 * 상태 전용 색 — **장식으로 쓰지 않는다.**
 *
 * "메인 1 + 보조 1" 규칙은 브랜드 색 이야기고, 성공/경고/오류처럼 뜻이 있는 신호는
 * 색으로 구분하는 게 맞다. 문제는 화면마다 초록·노랑을 제각각(#4ADE80, #6EE7B7,
 * #FBBF24, #FCD34D …) 박아 써서 같은 뜻이 다른 색으로 보였다는 것 — 그래서 여기 모았다.
 *
 * `onDark` 변형은 카메라 촬영 화면처럼 **검은 배경 위**에 올릴 때만 쓴다.
 * 흰 배경용 색을 검은 배경에 올리면 대비가 무너진다.
 */
export const STATUS_COLORS = {
  /** 성공·완료. 흰 배경 6.5:1, successSoft 위 5.8:1 로 둘 다 AA(4.5:1) 통과. */
  success: '#166B3F',
  successSoft: '#E6F4EC',
  successOnDark: '#4ADE80',
  /** 주의·확인 필요. 흰 배경 6.3:1, warningSoft 위 5.8:1. */
  warning: '#8A5300',
  warningSoft: '#FFF4E5',
  warningOnDark: '#FCD34D',
  /** 오류 배경 — 글자색은 COLORS.error 를 쓴다. */
  errorSoft: '#FBEAEA',
  errorOnDark: '#FCA5A5',
  /** 카메라·모달 뒤를 덮는 막. */
  scrim: 'rgba(0,0,0,0.72)',
  /** 카메라 촬영·3D 뷰어처럼 화면 전체가 어두운 배경. */
  cameraBackground: '#000000',
  viewerBackground: '#101418',
  /** 그림자 색 — 검정 대신 살짝 푸른 먹색이라 브랜드 톤에서 뜨지 않는다. */
  shadow: '#0B1B3A',
} as const;
