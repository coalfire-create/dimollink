import React from 'react';
import { DevRoleShortcuts, type DevRoleKey } from './welcome/DevRoleShortcuts';
import { PublicLanding } from './welcome/PublicLanding';

/**
 * 진입 게이트 — 앱을 열면 가장 먼저 보이는 화면.
 * 로그인 / 회원가입으로만 서비스에 들어갈 수 있고, 둘러보기(게스트)는 별도 경로.
 *
 * 첫 화면은 웹에서 곧 **홈페이지**다. 화면 구성은 둘러보기와 같은 [[PublicLanding]] 을 쓴다
 * (PG 심사가 보는 판매 상품·사업자 정보가 둘 다에 있어야 한다).
 */
export function WelcomeScreen({
  onLogin,
  onSignup,
  onGuest,
  onBuy,
  onAdmin,
  onDevRoleSelect,
}: {
  onLogin: () => void;
  onSignup: () => void;
  onGuest: () => void;
  /** 상품 안내의 "구매하기" — 로그인 후 스토어로 이어진다. */
  onBuy: () => void;
  onAdmin?: () => void;
  onDevRoleSelect?: (role: DevRoleKey) => void;
}) {
  return (
    <PublicLanding
      onLogin={onLogin}
      onSignup={onSignup}
      onGuest={onGuest}
      onBuy={onBuy}
      onAdmin={onAdmin}
      // UI 검증용 로그인 없는 빠른 진입 칩 — 개발 빌드에서만 넘어온다.
      devShortcuts={onDevRoleSelect ? <DevRoleShortcuts onSelect={onDevRoleSelect} /> : undefined}
    />
  );
}
