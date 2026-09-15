import { LocaleConfig } from 'react-native-calendars';

/**
 * 달력 한글 설정 — import 만으로 적용되는 부수효과 모듈.
 *
 * react-native-calendars 는 전역 LocaleConfig 하나를 쓴다. 화면 파일 맨 위에서
 * 이걸 설정하면 "이 화면이 왜 전역 설정을 하지?" 싶은 코드 30줄이 폼 코드 앞을 막는다.
 * 설정은 여기 두고, 달력을 쓰는 화면이 이 파일을 import 한다.
 */

const MONTHS = [
  '1월',
  '2월',
  '3월',
  '4월',
  '5월',
  '6월',
  '7월',
  '8월',
  '9월',
  '10월',
  '11월',
  '12월',
];

LocaleConfig.locales.kr = {
  monthNames: MONTHS,
  monthNamesShort: MONTHS,
  dayNames: ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'],
  dayNamesShort: ['일', '월', '화', '수', '목', '금', '토'],
  today: '오늘',
};
LocaleConfig.defaultLocale = 'kr';
