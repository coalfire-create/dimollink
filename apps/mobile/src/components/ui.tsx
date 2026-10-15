/**
 * 공용 UI 컴포넌트 — 도메인별 파일의 진입점(배럴).
 *
 * 예전에는 이 파일 하나에 버튼·카드·입력·배너·빈 상태가 다 있었다(600줄+).
 * 버튼 하나를 고치려 해도 관련 없는 스타일 수십 개를 스크롤해 지나가야 했고,
 * 새 컴포넌트는 "그냥 맨 아래"에 붙어서 순서에 의미가 없어졌다.
 *
 * 지금은 성격별로 나뉘어 있고 여기서 다시 모아 내보낸다. 화면 쪽 import 경로
 * (`../components/ui`)는 그대로라 호출부를 건드리지 않는다.
 * 새 컴포넌트는 맞는 파일에 넣고 여기에 한 줄 더한다.
 *
 * 이 컴포넌트들이 접근성 기준(글자 18px+, 버튼 48px+, 여백 8px 배수)을 강제한다 —
 * 화면에서 RN 기본 Button/TextInput 을 직접 쓰지 않는다.
 */
export { AppButton, type AppButtonProps } from './ui/AppButton';
export {
  Card,
  InfoRow,
  KeyboardAwareScreen,
  SectionTitle,
  StatusBadge,
  StickyFooter,
} from './ui/Surfaces';
export { Field, FieldError, type FieldProps } from './ui/Field';
export { EmptyState, ErrorBanner, InlineEmpty, LoadingView } from './ui/Feedback';
export { FloatingSupportButton, ImagePlaceholder } from './ui/Brand';
export { IconTile } from './ui/IconTile';
