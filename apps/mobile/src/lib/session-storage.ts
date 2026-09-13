import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 세션 토큰 영속 저장 — 자동 로그인용.
 * AsyncStorage(웹은 localStorage)를 쓰되, 네이티브 모듈이 아직 링크되지 않은 환경에서도
 * 앱이 죽지 않도록 실패 시 메모리 폴백으로 동작한다(그 세션 동안만 유지).
 */

const TOKEN_KEY = 'dimol.session.token';

let memoryToken: string | null = null;

export async function saveToken(token: string): Promise<void> {
  memoryToken = token;
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch {
    // 네이티브 미링크 등 — 메모리 폴백만 유지.
  }
}

export async function loadToken(): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(TOKEN_KEY);
    if (stored) return stored;
  } catch {
    // 폴백으로 진행.
  }
  return memoryToken;
}

export async function clearToken(): Promise<void> {
  memoryToken = null;
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // 무시 — 메모리 값은 이미 정리됨.
  }
}

const GUIDE_SEEN_KEY = 'dimol.guide.seen';
let memoryGuideSeen = false;

export async function hasSeenGuide(userId?: string): Promise<boolean> {
  const key = userId ? `${GUIDE_SEEN_KEY}.${userId}` : GUIDE_SEEN_KEY;
  try {
    const val = await AsyncStorage.getItem(key);
    return val === 'true';
  } catch {
    return memoryGuideSeen;
  }
}

export async function setSeenGuide(userId?: string): Promise<void> {
  memoryGuideSeen = true;
  const key = userId ? `${GUIDE_SEEN_KEY}.${userId}` : GUIDE_SEEN_KEY;
  try {
    await AsyncStorage.setItem(key, 'true');
  } catch {
    // 무시
  }
}

