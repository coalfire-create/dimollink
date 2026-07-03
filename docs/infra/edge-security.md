# 엣지 보안 — TLS · CDN · WAF · DDoS

앱은 앱 레벨 보안(인증/인가, 보안 헤더, CORS 허용목록, 레이트리밋 전역300·인증20/분,
본문 크기 제한)을 이미 갖췄다. 엣지(플랫폼)에서 아래를 더한다.

## TLS 종단

- 공개 트래픽은 반드시 HTTPS. Vercel/Cloudflare/ALB 에서 종단.
- **HSTS**: 앱이 운영 모드에서 `Strict-Transport-Security` 를 이미 응답. 엣지에서도 유지.
- 인증서: 플랫폼 자동(Let's Encrypt/ACM). HTTP→HTTPS 리다이렉트 강제.
- `trust proxy` 활성(앱 기본) — 프록시 뒤 실제 클라이언트 IP 를 레이트리밋에 사용.

## CDN

- 정적 자산(웹 번들 `apps/mobile/dist`)은 CDN 캐시. `/api/*` 는 **캐시 금지**(동적).
- Vercel 사용 시 `vercel.json` 의 정적/함수 분리가 이를 처리.

## WAF (Cloudflare 예시)

- **Managed Ruleset** 활성(OWASP Core). 오탐 시 룰별 예외.
- **Rate Limiting Rule**(엣지, 앱 레이트리밋과 다층):
  - `/api/auth/*` → IP당 20 req/분 초과 시 차단(앱과 동일 기준을 엣지에서도).
  - `/api/*` → IP당 600 req/분 초과 시 챌린지.
- **Bot Fight / Managed Challenge**: 로그인·회원가입 경로에 챌린지.
- **IP 허용목록**: 백오피스/메트릭(`x-admin-token` 경로)은 사무실/모니터링 IP만 허용.
- **CORS**: 앱의 `CORS_ORIGINS` 와 엣지 정책을 일치시킬 것.

## AWS(ALB + WAF) 대안

- ALB(HTTPS, ACM 인증서) → 타깃(컨테이너/EC2). `/api/health/ready` 를 타깃 헬스체크로.
- AWS WAF: AWSManagedRulesCommonRuleSet + RateBasedRule(IP 5분당 임계) 연결.
- Shield Standard(기본 DDoS) + 중요 시 Shield Advanced.

## 체크리스트

- [ ] HTTPS 강제 + HSTS 유지
- [ ] `/api/*` 캐시 비활성
- [ ] WAF managed ruleset + 엣지 레이트리밋
- [ ] 백오피스/메트릭 경로 IP 제한
- [ ] `CORS_ORIGINS` 와 엣지 CORS 일치
- [ ] 실제 클라이언트 IP 전달(프록시 헤더) 확인
