import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 서버 상태 캐시 — 화면이 "로딩/에러/데이터"를 매번 useState 세 개로 다시 짜지 않게 한다.
 *
 * React Query 를 쓰지 않는 이유: 이 앱은 내비게이션도 외부 라이브러리 없이 돌리는
 * 크기이고(navigation.tsx), 필요한 건 캐시·무효화·중복요청 제거 세 가지뿐이다.
 * 대신 화면 쪽 사용법은 React Query 와 같게 맞춰 두었다 — 나중에 교체할 때 호출부를
 * 거의 그대로 둘 수 있다.
 *
 * 핵심 동작:
 *  - 같은 key 는 캐시를 공유한다. 목록 → 상세 → 뒤로 갈 때 화면이 다시 비지 않는다.
 *  - staleTime 안에 다시 마운트되면 네트워크를 타지 않고 캐시를 즉시 보여준 뒤,
 *    지났으면 화면은 유지한 채 뒤에서 갱신한다(stale-while-revalidate).
 *  - 같은 key 를 여러 화면이 동시에 요청하면 fetch 는 한 번만 나간다.
 *  - invalidateQueries(prefix) 로 쓰기 후 관련 화면을 한 번에 갱신한다.
 */

interface CacheEntry<T = unknown> {
  data?: T;
  error?: Error;
  /** 마지막으로 성공한 시각(ms). 없으면 아직 성공한 적 없음. */
  updatedAt?: number;
  /** 진행 중인 요청 — 중복 호출을 막는다. */
  inFlight?: Promise<void>;
  /**
   * 마지막으로 이 키를 불러온 함수. 무효화가 "다시 불러오라"고 시키려면 필요하다
   * (키 문자열만으로는 무엇을 부를지 알 수 없다).
   */
  fetcher?: () => Promise<unknown>;
}

type Listener = () => void;

const cache = new Map<string, CacheEntry>();
const listeners = new Map<string, Set<Listener>>();

function notify(key: string): void {
  listeners.get(key)?.forEach((l) => l());
}

function subscribe(key: string, listener: Listener): () => void {
  const set = listeners.get(key) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

/** 캐시에 직접 써 넣는다 — 서버 응답을 이미 손에 들고 있을 때(쓰기 직후) 재조회를 아낀다. */
export function setQueryData<T>(key: string, data: T): void {
  const entry = (cache.get(key) ?? {}) as CacheEntry<T>;
  entry.data = data;
  entry.error = undefined;
  entry.updatedAt = Date.now();
  cache.set(key, entry as CacheEntry);
  notify(key);
}

export function getQueryData<T>(key: string): T | undefined {
  return cache.get(key)?.data as T | undefined;
}

/**
 * key 가 prefix 로 시작하는 캐시를 낡은 것으로 표시하고, 지금 화면에 붙어 있는
 * 쿼리는 즉시 다시 불러온다. (예: 요청 생성/취소 후 `invalidateQueries('requests')`)
 */
export function invalidateQueries(prefix: string): void {
  for (const [key, entry] of cache) {
    if (!key.startsWith(prefix)) continue;
    entry.updatedAt = undefined; // 다음 구독 시 반드시 다시 불러온다.
    // 지금 화면에 붙어 있는 쿼리는 여기서 바로 다시 불러온다.
    // (구독자가 없으면 그냥 낡은 것으로 두고, 다음에 그 화면이 열릴 때 불러온다.)
    if (listeners.get(key)?.size && entry.fetcher && !entry.inFlight) {
      void runFetch(key, entry.fetcher);
    } else {
      notify(key);
    }
  }
}

async function runFetch<T>(key: string, fetcher: () => Promise<T>): Promise<void> {
  const entry = (cache.get(key) ?? {}) as CacheEntry<T>;
  entry.fetcher = fetcher as () => Promise<unknown>;
  cache.set(key, entry as CacheEntry);
  if (entry.inFlight) return entry.inFlight;
  const promise = (async () => {
    try {
      const data = await fetcher();
      entry.data = data;
      entry.error = undefined;
      entry.updatedAt = Date.now();
    } catch (err) {
      entry.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      entry.inFlight = undefined;
      notify(key);
    }
  })();
  entry.inFlight = promise;
  notify(key); // isFetching 을 즉시 반영.
  return promise;
}

export interface QueryOptions {
  /** 이 시간(ms) 안에는 캐시를 신선한 것으로 보고 다시 부르지 않는다. 기본 30초. */
  staleTime?: number;
  /** false 면 아무것도 부르지 않는다(선행 조건이 아직 없을 때). */
  enabled?: boolean;
}

export interface QueryResult<T> {
  data: T | undefined;
  error: Error | undefined;
  /** 보여줄 데이터가 아직 없는 상태 — 스켈레톤을 띄우는 조건. */
  isLoading: boolean;
  /** 백그라운드 갱신 포함. 화면은 유지한 채 스피너만 돌릴 때 쓴다. */
  isFetching: boolean;
  isError: boolean;
  refetch: () => Promise<void>;
}

/**
 * 서버 데이터 구독. key 가 null 이면 비활성(로그인 전 등).
 * fetcher 는 매 렌더 새로 만들어도 되게 ref 로 잡아 둔다 — useCallback 을 강요하지 않는다.
 */
export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: QueryOptions = {},
): QueryResult<T> {
  const { staleTime = 30_000, enabled = true } = options;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [, forceRender] = useState(0);
  const active = enabled && key !== null;

  useEffect(() => {
    if (!active || key === null) return;
    const unsubscribe = subscribe(key, () => forceRender((n) => n + 1));
    const entry = cache.get(key);
    const fresh = entry?.updatedAt !== undefined && Date.now() - entry.updatedAt < staleTime;
    if (!fresh && !entry?.inFlight) void runFetch(key, () => fetcherRef.current());
    return unsubscribe;
  }, [key, active, staleTime]);

  const refetch = useCallback(async () => {
    if (key === null) return;
    await runFetch(key, () => fetcherRef.current());
  }, [key]);

  const entry = (key !== null ? cache.get(key) : undefined) as CacheEntry<T> | undefined;
  return {
    data: entry?.data,
    error: entry?.error,
    isLoading: active && entry?.data === undefined && entry?.error === undefined,
    isFetching: entry?.inFlight !== undefined,
    isError: entry?.error !== undefined,
    refetch,
  };
}

/** 테스트·로그아웃 시 캐시 비우기 — 다음 사용자의 화면에 이전 사용자의 데이터가 남지 않게 한다. */
export function clearQueryCache(): void {
  cache.clear();
  for (const key of listeners.keys()) notify(key);
}
