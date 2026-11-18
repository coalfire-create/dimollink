import React from 'react';
import { PublicLanding } from './welcome/PublicLanding';

/**
 * 게스트(로그인 없이 둘러보기) 화면.
 * 서비스 소개만 제공하고, 요청 등록·내 정보 등 실제 기능은 로그인/회원가입으로 유도한다.
 * 판매 상품과 사업자 정보(고객센터 전화)도 여기서 볼 수 있다 — PG 심사 요건.
 * 첫 화면과 같은 홈페이지를 쓰고, 이미 둘러보는 중이라 "둘러보기" 버튼만 빠진다.
 */
export function GuestHomeScreen({
  onLogin,
  onSignup,
  onBuy,
}: {
  onLogin: () => void;
  onSignup: () => void;
  /** 상품 "구매하기" — 로그인 후 스토어로 이어진다. */
  onBuy: () => void;
}) {
  return <PublicLanding onLogin={onLogin} onSignup={onSignup} onBuy={onBuy} />;
}
