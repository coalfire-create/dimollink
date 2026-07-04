-- 디몰비전 RLS 정책 (기획서 §5.2 — 모든 테이블 Row Level Security 적용).
-- 원칙: 사용자는 본인 데이터만 접근. AI 서버는 service_role 이 아닌 최소 권한 전용 키로 접근한다.
-- analyses.status/result 갱신은 Edge Function(service 컨텍스트)이 담당(사용자 UPDATE 미허용).

alter table profiles enable row level security;
alter table analyses enable row level security;
alter table analysis_images enable row level security;
alter table feedback enable row level security;
alter table model_versions enable row level security;
alter table kb_documents enable row level security;

-- profiles: 본인 행만.
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles
  for select using (user_id = auth.uid ());

drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles
  for insert with check (user_id = auth.uid ());

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (user_id = auth.uid ()) with check (user_id = auth.uid ());

-- analyses: 본인 조회/생성만. 갱신·삭제는 service 전용(정책 없음 → RLS 차단).
drop policy if exists analyses_select_own on analyses;
create policy analyses_select_own on analyses
  for select using (user_id = auth.uid ());

drop policy if exists analyses_insert_own on analyses;
create policy analyses_insert_own on analyses
  for insert with check (user_id = auth.uid ());

-- analysis_images: 부모 analyses 소유자만.
drop policy if exists analysis_images_select_own on analysis_images;
create policy analysis_images_select_own on analysis_images
  for select using (
    exists (
      select 1 from analyses a
      where a.id = analysis_images.analysis_id and a.user_id = auth.uid ()
    )
  );

drop policy if exists analysis_images_insert_own on analysis_images;
create policy analysis_images_insert_own on analysis_images
  for insert with check (
    exists (
      select 1 from analyses a
      where a.id = analysis_images.analysis_id and a.user_id = auth.uid ()
    )
  );

-- feedback: 부모 analyses 소유자만(데이터 플라이휠 원천).
drop policy if exists feedback_select_own on feedback;
create policy feedback_select_own on feedback
  for select using (
    exists (
      select 1 from analyses a
      where a.id = feedback.analysis_id and a.user_id = auth.uid ()
    )
  );

drop policy if exists feedback_insert_own on feedback;
create policy feedback_insert_own on feedback
  for insert with check (
    exists (
      select 1 from analyses a
      where a.id = feedback.analysis_id and a.user_id = auth.uid ()
    )
  );

-- model_versions: 인증 사용자 읽기 전용(모델 버전 표시용). 쓰기는 service 전용.
drop policy if exists model_versions_select_auth on model_versions;
create policy model_versions_select_auth on model_versions
  for select to authenticated using (true);

-- kb_documents: 정책 없음 → RLS 로 잠금. RAG 검색은 service 키만 접근(내부 지식베이스).
