import { useEffect, useState } from 'react';
import { fetchPaymentConfig, type PaymentConfig } from '../api/client';
import { PORTONE } from '../config';

/**
 * 결제창에 넘길 상점·채널을 서버에서 받아 쓴다.
 *
 * 왜 서버에서 받나: PG(현재 토스페이먼츠)나 채널을 바꾸는 일은 계약·심사 쪽에서 일어나는데,
 * 값이 앱 번들에 박혀 있으면 그때마다 웹 번들을 다시 빌드해 배포해야 한다. 게다가 서버가
 * 결제를 검증할 때 쓰는 상점(PORTONE_STORE_ID)과 앱이 결제창에 넘긴 상점이 어긋나도
 * 사용자가 실제로 결제에 실패하기 전에는 아무도 모른다. 서버 env 한 곳을 정답으로 둔다.
 *
 * 서버 응답이 늦거나 실패하면 번들에 있는 값(`config.ts`)으로 결제를 계속 진행한다 —
 * 설정 조회 실패가 결제 자체를 막으면 손해가 더 크다.
 */

/** 한 번 받아오면 앱이 살아 있는 동안 다시 받지 않는다(세션 중 바뀔 값이 아니다). */
let cached: PaymentConfig | null = null;

const FALLBACK: PaymentConfig = {
  storeId: PORTONE.storeId,
  channelKey: PORTONE.channelKey,
  mode: 'test',
};

export function usePaymentConfig(): PaymentConfig {
  const [config, setConfig] = useState<PaymentConfig>(cached ?? FALLBACK);

  useEffect(() => {
    if (cached) return;
    let alive = true;
    void fetchPaymentConfig()
      .then((next) => {
        cached = next;
        if (alive) setConfig(next);
      })
      .catch(() => {
        // 번들 기본값으로 계속 간다. 결제 실패는 결제창이 알려준다.
      });
    return () => {
      alive = false;
    };
  }, []);

  return config;
}
