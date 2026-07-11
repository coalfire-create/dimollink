-- 현장 사진 비공개 버킷 + 사용자 폴더 격리 (기획서 §3.2 업로드, §7.2 PII).
-- 지금까지 README 산문으로만 있던 것을 마이그레이션으로 코드화 → `supabase db push` 로 적용.
--
-- 업로드는 Edge Function(sign-upload)이 service_role 로 발급한 서명 URL 로 이뤄지지만,
-- 아래 RLS 는 직접 접근에 대한 심층 방어다(사용자는 자기 폴더 <user_id>/... 만).

insert into storage.buckets (id, name, public)
values ('vision-site-photos', 'vision-site-photos', false)
on conflict (id) do nothing;

-- 업로드: 본인 폴더만
drop policy if exists "vision own folder upload" on storage.objects;
create policy "vision own folder upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vision-site-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 조회: 본인 폴더만
drop policy if exists "vision own folder read" on storage.objects;
create policy "vision own folder read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vision-site-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 삭제: 본인 폴더만(재분석 전 정리 등)
drop policy if exists "vision own folder delete" on storage.objects;
create policy "vision own folder delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vision-site-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
