import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon, type IconName } from './AppIcon';
import { useNativeDriver } from './motion';
import { theme } from '../theme';

/**
 * 토스트 — 화면 상단에 잠깐 떴다 사라지는 결과 알림.
 *
 * 접수·취소처럼 **화면이 바뀌면서 끝나는 동작**은 결과를 말해 줄 자리가 없다.
 * (요청 폼 → 상세로 넘어가면 폼의 성공 메시지는 같이 사라진다.) 그래서 결과는
 * 화면이 아니라 앱 위에 띄운다. 오류 배너(ErrorBanner)는 그 화면에 머무는 문제,
 * 토스트는 지나가는 결과 — 둘을 섞지 않는다.
 *
 * 색은 상태 토큰([[design-tokens]] STATUS_COLORS)만 쓴다. 성공/오류는 뜻이 있는
 * 신호라 색으로 구분하는 게 맞지만, 화면마다 다른 초록을 쓰면 뜻이 흐려진다.
 *
 * 고령 사용자 기준: 3.5초로 넉넉히 띄우고(읽을 시간), 글자 18px 이상, 탭하면 즉시 닫힌다.
 */

export type ToastTone = 'success' | 'danger' | 'info' | 'warning';

export interface ToastOptions {
  message: string;
  /** 보조 설명 한 줄(선택). */
  description?: string;
  tone?: ToastTone;
  /** 표시 시간(ms). 기본 3500. */
  durationMs?: number;
}

interface ToastApi {
  show: (options: ToastOptions) => void;
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const NOOP_TOAST: ToastApi = {
  show: () => undefined,
  success: () => undefined,
  error: () => undefined,
  info: () => undefined,
};

/**
 * 토스트 호출부. Provider 밖(테스트·스토리북 등)에서도 화면이 죽지 않도록
 * 아무것도 하지 않는 no-op 을 돌려준다 — 알림 하나 때문에 앱이 터지면 안 된다.
 */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP_TOAST;
}

const { colors } = theme;

/** 톤별 배경·글자·아이콘. 전부 상태 토큰과 브랜드 색 안에서만 만든다. */
const TONE_STYLE: Record<ToastTone, { background: string; text: string; icon: IconName }> = {
  success: { background: colors.successSoft, text: colors.success, icon: 'check' },
  danger: { background: colors.errorSoft, text: colors.error, icon: 'alert' },
  warning: { background: colors.warningSoft, text: colors.warning, icon: 'alert' },
  info: { background: colors.primarySoft, text: colors.primary, icon: 'notifications' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<(ToastOptions & { id: number }) | null>(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    Animated.parallel([
      Animated.timing(translateY, { toValue: -120, duration: 180, useNativeDriver }),
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver }),
    ]).start(() => setCurrent(null));
  }, [opacity, translateY]);

  const show = useCallback(
    (options: ToastOptions) => {
      seq.current += 1;
      setCurrent({ ...options, id: seq.current });
      if (timer.current) clearTimeout(timer.current);
      translateY.setValue(-120);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver, damping: 18, stiffness: 180 }),
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver }),
      ]).start();
      timer.current = setTimeout(hide, options.durationMs ?? 3500);
    },
    [hide, opacity, translateY],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message, description) => show({ message, description, tone: 'success' }),
      error: (message, description) => show({ message, description, tone: 'danger' }),
      info: (message, description) => show({ message, description, tone: 'info' }),
    }),
    [show],
  );

  const palette = TONE_STYLE[current?.tone ?? 'info'];

  return (
    <ToastContext.Provider value={api}>
      {children}
      {current ? (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrap, { opacity, transform: [{ translateY }] }]}
        >
          <Pressable
            accessibilityRole="alert"
            accessibilityLabel={`${current.message}${current.description ? `. ${current.description}` : ''}`}
            onPress={hide}
            style={[styles.toast, { backgroundColor: palette.background }]}
          >
            <View style={[styles.iconCircle, { backgroundColor: palette.text }]}>
              <AppIcon name={palette.icon} size={18} color={colors.background} />
            </View>
            <View style={styles.body}>
              <Text style={[styles.message, { color: palette.text }]}>{current.message}</Text>
              {current.description ? (
                <Text style={styles.description}>{current.description}</Text>
              ) : null}
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const { font, spacing, radius } = theme;

const styles = StyleSheet.create({
  wrap: {
    left: 0,
    position: 'absolute',
    right: 0,
    // 상태바/노치를 피해 헤더 위에 뜬다.
    top: Platform.OS === 'ios' ? 56 : spacing.sm,
    zIndex: 100,
  },
  toast: {
    alignItems: 'center',
    borderRadius: radius.card,
    flexDirection: 'row',
    marginHorizontal: spacing.sm,
    padding: spacing.sm,
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    marginRight: spacing.xs,
    width: 32,
  },
  body: {
    flex: 1,
  },
  message: {
    fontSize: font.body,
    fontWeight: '800',
  },
  description: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: 4,
  },
});
