# apps/vision-web — 디몰비전 웹

철거 현장 사진 업로드 → 진행 상태 → 분석 리포트 뷰. 기획서 §3.1 프론트엔드 계층.
**프레임워크 없는 경량 구성**(HTML + Vanilla JS), 모바일 반응형, 정적 호스팅(Vercel 등).

> ⚠️ **Phase V1 골격.** 기본은 백엔드 없이 도는 **mock** 흐름(업로드→3단계 진행→예시 리포트)이라
> UI 를 바로 확인할 수 있다. Supabase 연동(`lib/client.js` 의 `createSupabaseClient`)은 스텁이다.

## 설계 원칙 (기획서 §3.1)

- 프론트는 **AI 서버를 직접 호출하지 않는다.** 실제 흐름은 Supabase Storage 업로드(서명 URL)
  → `analyses` 행 생성 → Edge Function 이 AI 서버 트리거 → Realtime 으로 진행/결과 구독.
- 접근성(CLAUDE.md): 본문 18px+, 제목 24px+, 버튼 48px+, 여백 8px 배수, 메인 1 + 보조 1 색.
- 안전(§7.1): 법적 고지·석면 의심 안내를 리포트에 **항상** 노출, 석면은 "의심/조사 필요"로만 표기.

## 구조

```
index.html        업로드 / 진행 / 리포트 3뷰
styles.css        브랜드 토큰 미러(디자인 접근성 기준)
config.js         런타임 설정(mock 플래그, Supabase 공개값)
taxonomy.js       자재/위험/단계 라벨(shared 미러)
lib/format.js     순수 포맷 헬퍼(DOM 비의존, 테스트 가능)
lib/client.js     분석 클라이언트(mock + Supabase 스텁)
lib/report.js     VisionReport → DOM 렌더
app.js            화면 전환·이벤트 배선
```

## 로컬 실행

정적 파일이라 아무 정적 서버로 연다:

```bash
cd apps/vision-web
python3 -m http.server 5173
# http://localhost:5173 접속 → 사진 선택 → "분석 시작"(mock)
```

## 다음 (미구현)

- Supabase 연동: 업로드 서명 URL, `analyses` insert, Edge Function 트리거, Realtime 구독 — §3.2
- `prefill-btn` → 디몰링크 매칭 신청 프리필(waste_plan) 연동 — Phase V4(본체 로드맵 도달 후)
- PDF 저장, 사용자 피드백(정확/부정확) 수집 — §2.1
