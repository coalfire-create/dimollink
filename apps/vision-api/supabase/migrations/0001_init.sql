-- 디몰비전 Supabase 스키마 초안 (기획서 §5.2)
-- 대상: Supabase(Postgres). RAG 벡터 검색은 별도 벡터 DB 없이 pgvector 로 통합(운영 부담↓).
-- 적용: supabase db push 또는 마이그레이션 파이프라인. (로컬 Postgres 없이 작성 — 미적용)

-- 확장: gen_random_uuid()용 pgcrypto, RAG 임베딩용 vector.
create extension if not exists pgcrypto;
create extension if not exists vector;

-- 공통 updated_at 갱신 트리거 함수.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 사용자 역할: 배출자(철거 의뢰인) / 철거업체.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'vision_user_role') then
    create type vision_user_role as enum ('DISCHARGER', 'DEMOLITION');
  end if;
end;
$$;

-- 잡 상태: vision-api JobStatus 와 정합.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'vision_analysis_status') then
    create type vision_analysis_status as enum
      ('queued', 'processing', 'done', 'failed', 'canceled');
  end if;
end;
$$;

-- profiles: auth.users 1:1 확장.
create table if not exists profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role vision_user_role not null,
  company_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- analyses: 리포트 본체. result 는 VisionReport(JSON 계약) 그대로.
create table if not exists analyses (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  status vision_analysis_status not null default 'queued',
  stage text,
  input_meta jsonb not null default '{}'::jsonb,
  result jsonb,
  model_version text,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analyses_user_id_idx on analyses (user_id);
create index if not exists analyses_status_idx on analyses (status);

create trigger analyses_set_updated_at
  before update on analyses
  for each row execute function set_updated_at();

-- analysis_images: Storage 경로 참조. PII 블러/EXIF 제거 플래그(§7.2).
create table if not exists analysis_images (
  id uuid primary key default gen_random_uuid (),
  analysis_id uuid not null references analyses (id) on delete cascade,
  storage_path text not null,
  exif_stripped boolean not null default false,
  pii_blurred boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists analysis_images_analysis_id_idx
  on analysis_images (analysis_id);

-- feedback: 데이터 플라이휠 원천(정확/부정확 평가·수정 내용).
create table if not exists feedback (
  id uuid primary key default gen_random_uuid (),
  analysis_id uuid not null references analyses (id) on delete cascade,
  rating smallint check (rating between 1 and 5),
  corrected_result jsonb,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists feedback_analysis_id_idx on feedback (analysis_id);

-- model_versions: 평가 이력 포함 배포 대장(§5.1).
create table if not exists model_versions (
  version text primary key,
  base_model text not null,
  adapter_hash text not null,
  eval_scores jsonb not null default '{}'::jsonb,
  deployed_at timestamptz not null default now()
);

-- kb_documents: RAG 안전지침 지식베이스. embedding = BGE-M3(1024차원).
create table if not exists kb_documents (
  id uuid primary key default gen_random_uuid (),
  source text not null,
  clause text,
  body text not null,
  revised_at date,
  embedding vector (1024),
  created_at timestamptz not null default now()
);

-- 벡터 근접 검색용 HNSW 인덱스(코사인). 대량 적재 후 성능에 따라 파라미터 조정.
create index if not exists kb_documents_embedding_idx
  on kb_documents using hnsw (embedding vector_cosine_ops);
