import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { ApiError } from '../../api/client';
import { confirmDialog } from '../../lib/dialog';
import { theme } from '../../theme';

/**
 * 관리자 탭 공통 — 인증 전달, 데이터 로딩, 스타일.
 *
 * 탭마다 자기 데이터를 직접 불러온다. 예전에는 화면에 들어가는 순간 10개 API 를 한꺼번에
 * 불렀는데, 승인 대기만 보러 온 사람도 올바로 큐·이상거래까지 기다려야 했고, 탭을 하나
 * 추가하려면 껍데기 화면의 로딩 코드를 같이 고쳐야 했다.
 */

export interface AdminTabProps {
  /** 공유 운영 토큰. 빈 문자열이면 로그인 세션으로 인증한다. */
  token: string;
  onError: (message: string) => void;
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * 목록 하나를 불러오는 훅. 실패해도 화면은 뜬다 — 한 탭이 죽어서 백오피스 전체를
 * 못 쓰게 되면 안 된다.
 */
export function useAdminList<T>(
  load: () => Promise<T[]>,
  onError: (message: string) => void,
  fallbackMessage: string,
): { items: T[]; setItems: React.Dispatch<React.SetStateAction<T[]>>; reload: () => void; loading: boolean } {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    void load()
      .then((data) => {
        if (Array.isArray(data)) setItems(data);
      })
      .catch((err: unknown) => onError(errorMessage(err, fallbackMessage)))
      .finally(() => setLoading(false));
    // load 는 호출부에서 useCallback 으로 고정한다.
  }, [load, onError, fallbackMessage]);

  useEffect(reload, [reload]);
  return { items, setItems, reload, loading };
}

/**
 * 되돌릴 수 없는 동작은 한 번 되묻는다.
 *
 * 예전에는 `Alert.alert` 을 직접 썼는데, 관리자 백오피스는 사실상 웹에서 쓰이고
 * react-native-web 의 Alert 은 빈 함수라 **정산 실행·요청 취소가 눌러도 아무 일도
 * 안 일어났다**. 플랫폼을 가려 주는 [[dialog]] 를 쓴다.
 */
export function confirmThen(title: string, body: string, run: () => void): void {
  void confirmDialog(title, body).then((ok) => {
    if (ok) run();
  });
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <Text style={adminStyles.empty}>{children}</Text>;
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <Text style={adminStyles.meta}>{children}</Text>;
}

const { colors, font, spacing } = theme;

/** 탭들이 공유하는 스타일. 한 곳에 둬야 탭마다 글씨 크기가 갈라지지 않는다. */
export const adminStyles = StyleSheet.create({
  empty: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.md },
  name: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.xs / 2 },
  warn: { color: colors.error, fontSize: font.body, fontWeight: '700', marginTop: spacing.xs },
  actions: { flexDirection: 'row', marginTop: spacing.sm },
  actionBtn: { flex: 1 },
  spacer: { height: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 8,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    marginRight: spacing.xs,
    minHeight: theme.touch.minButtonHeight,
    paddingHorizontal: spacing.sm,
  },
  chipLabel: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    color: colors.text,
    flex: 1,
    fontSize: font.body,
    fontWeight: '700',
    marginRight: spacing.sm,
  },
  rowValue: { color: colors.textMuted, fontSize: font.body, fontWeight: '700' },
});
