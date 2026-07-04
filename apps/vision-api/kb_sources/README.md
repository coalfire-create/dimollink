# kb_sources — RAG 안전지침 원문

디몰비전 RAG 지식베이스(§3.4)의 원문 소스. 여기 파일들을 청킹·임베딩해 `kb_documents` 에 적재한다.

## 포맷

`*.md` / `*.txt`. 상단 front matter + `## <조항>` 헤더로 조항을 구분한다:

```
---
source: <출처 문서명>
revised_at: <YYYY-MM-DD>   # 선택
---

## 제5조(해체작업계획서)
본문...
```

- `source`, `clause`(헤더), `body` 가 그대로 `kb_documents` 로 들어간다.
- 조항 본문이 길면 자동으로 창 분할(기본 800자, overlap 100자).

## 수록 대상 (기획서 §3.4)

- KOSHA 해체공사 안전보건작업 지침
- 산업안전보건기준에 관한 규칙 (구축물 해체 관련 조항)
- 건축물관리법·시행령의 해체공사 규정
- 석면안전관리법 관련 고시
- 건설폐기물의 재활용촉진에 관한 법률의 분리배출 기준

## ⚠️ 현재 상태

지금 있는 파일은 **파이프라인 검증용 샘플 발췌**다. 상용 적재 전 각 항목을 **공식 원문·정확한 조문 번호**로
교체하고, 법령 개정 반영을 위해 **분기 1회 갱신**한다(§3.4). 출처·조항 표기는 리포트 인용의 근거가 되므로 정확해야 한다.

## 적재

```bash
# 목 임베딩으로 JSONL 검사(로컬)
python scripts/ingest_kb.py --sources-dir kb_sources --out kb_chunks.jsonl

# 실제 BGE-M3 → Postgres (kb extra 필요)
pip install '.[kb]'
python scripts/ingest_kb.py --embedder bge-m3 --dsn "$SUPABASE_DB_URL"
```
