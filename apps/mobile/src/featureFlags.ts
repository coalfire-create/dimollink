import { FEATURE_INTERIOR_DEFAULT } from '@dimol/shared';

/**
 * 클라이언트 기능 노출 플래그.
 *
 * 인테리어(밀봉 역경매)는 파일럿 범위 밖(양평·건설폐기물)이라 기본 숨김이다.
 * 기본값은 shared 의 FEATURE_INTERIOR_DEFAULT(=false)를 따르고, 데모/운영에서 켜려면
 * 빌드시 EXPO_PUBLIC_FEATURE_INTERIOR=true 로 활성화한다. 이 값이 false 인 동안에는
 * 인테리어 진입점(소비자 홈 카드·가입 유형 선택 등)이 노출되지 않는다.
 */
export const FEATURE_INTERIOR =
  process.env.EXPO_PUBLIC_FEATURE_INTERIOR === 'true' ? true : FEATURE_INTERIOR_DEFAULT;
