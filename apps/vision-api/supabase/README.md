# 디몰비전 Supabase 스키마

기획서 §5.2 의 핵심 테이블 + RLS. 별도 벡터 DB 없이 **pgvector** 로 RAG 지식베이스까지 통합한다.
본체(`apps/api`, 자체 PostgreSQL)와 분리된 디몰비전 전용 Supabase 프로젝트다.

> ⚠️ 로컬 Postgres 없이 작성했다(**미적용**). 문법은 PostgreSQL 파서(pglast)로 검증했으나,
> 실제 적용·pgvector/HNSW 동작은 Supabase 프로젝트에서 `supabase db push` 로 확인해야 한다.

## 마이그레이션

| 파일 | 내용 |
|---|---|
| `migrations/0001_init.sql` | 확장(pgcrypto·vector), enum, 테이블 6종, 인덱스, updated_at 트리거 |
| `migrations/0002_rls.sql` | 전 테이블 RLS + 정책 |

## 테이블 (§5.2)

| 테이블 | 주요 컬럼 | 비고 |
|---|---|---|
| `profiles` | user_id(FK auth.users), role(배출자/철거업체), company_name | 본인 행만 |
| `analyses` | id, user_id, status, stage, input_meta, result(jsonb), model_version, error, attempts | 리포트 본체(result = VisionReport 계약) |
| `analysis_images` | analysis_id, storage_path, exif_stripped, pii_blurred | Storage 경로 참조(§7.2) |
| `feedback` | analysis_id, rating, corrected_result, comment | 데이터 플라이휠 원천 |
| `model_versions` | version, base_model, adapter_hash, eval_scores, deployed_at | 평가 이력 포함 배포 대장(§5.1) |
| `kb_documents` | source, clause, body, revised_at, embedding(vector 1024) | RAG KB, BGE-M3 임베딩 |

## RLS 요약

- 사용자는 **본인 데이터만** 접근(`auth.uid()` 기준).
- `analyses` 는 사용자 **조회/생성만** 허용. `status`/`result` 갱신·취소는 Edge Function(service 컨텍스트)이 수행 — 사용자 UPDATE 정책 없음.
- `analysis_images`·`feedback` 는 부모 `analyses` 소유자만.
- `model_versions` 는 인증 사용자 읽기 전용.
- `kb_documents` 는 정책 없음 → RLS 로 잠금. RAG 검색은 **최소 권한 전용 키**(service_role 아님)로만 접근.

## Storage (별도 설정 필요)

현장 사진은 **비공개 버킷**(예: `vision-site-photos`)에 서명 URL 로 직접 업로드(§3.2).
업로드 파이프라인에서 EXIF(GPS) 제거·PII 블러를 기본 수행(§7.2). 버킷 정책 예:

```sql
-- 사용자는 자신의 폴더(<user_id>/...)에만 업로드/조회
create policy "own folder upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vision-site-photos'
              and (storage.foldername(name))[1] = auth.uid()::text);
```

## 미구현 / 다음

- Edge Function: 사진 서명 URL 발급, `analyses` insert, vision-api `POST /v1/jobs` 트리거, 콜백 수신 → `analyses` 갱신, Realtime 브로드캐스트(§3.2)
- `kb_documents` 적재 파이프라인(법령 원문 청킹 + BGE-M3 임베딩) 및 분기 1회 갱신 루틴(§3.4)
- 임베딩 차원(1024)은 최종 임베딩 모델 확정 시 재확인
