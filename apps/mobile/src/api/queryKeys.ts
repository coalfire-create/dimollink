/**
 * 쿼리 키 — 캐시 한 칸의 이름.
 *
 * 문자열을 화면마다 직접 지으면 `requests:${id}` 와 `request:${id}` 처럼 미묘하게 갈라져
 * 쓰기 후 무효화가 조용히 빗나간다. 키는 전부 여기서만 만든다.
 * prefix 는 invalidateQueries 로 한 도메인을 통째로 무효화할 때 쓴다.
 */
export const requestsKey = {
  prefix: 'requests',
  /** 내 요청 목록. */
  list: (requesterId: string) => `requests:list:${requesterId}`,
  /** 요청 상세. */
  detail: (requestId: string) => `requests:detail:${requestId}`,
  /** 요청에 들어온 견적. */
  quotes: (requestId: string) => `requests:quotes:${requestId}`,
} as const;
