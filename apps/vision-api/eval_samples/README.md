# 평가셋

한 줄 = 현장 1곳. 학습셋과 반드시 분리한다(§4.4).

```json
{"site_id": "...", "domain": "site",
 "gt_materials": ["BRICK_MASONRY", "ROOFING_SLATE"],
 "pred_materials": ["BRICK_MASONRY"],
 "gt_asbestos": true, "pred_asbestos": true,
 "gt_quantity_ton": 8.0, "pred_quantity_ton": 6.0}
```

## `domain` — 가장 중요한 필드

표본이 **어느 분포에서 왔는지**다. 학습셋은 항공영상 약라벨(VWorld+건축물대장)과
단일 자재 지상 패치(MINC-2500 등)로 만들었는데, 실제 사용자가 찍는 사진은
**지상 근접·다중 자재·조명 제각각**이라 분포가 다르다. 두 도메인을 한 숫자로 섞으면
실배포 성능을 과대평가한다.

| 값 | 의미 |
|---|---|
| `aerial` | VWorld 항공영상 + 건축물대장 약라벨 |
| `patch` | MINC/콘크리트 등 단일 자재 지상 패치 |
| `site` | **실제 철거 현장 지상 촬영 — 배포 분포** |
| (생략) | `unknown` |

`site` 표본이 하나라도 있으면 **게이트는 site 에서만 판정한다**(`scripts/eval.py`).
없으면 혼합 점수로 판정하되 경고를 띄운다 — 그 수치는 실사용 성능을 보장하지 않는다.

## 파일

- `sample_evalset.jsonl` — 배선 검증용 더미. `domain` 없음(=unknown)이라 일부러 경고가 뜬다.
- `site_evalset_template.jsonl` — **실현장 평가셋 템플릿.** 아래 절차로 채운다.

## 실현장 평가셋 만드는 법 (남은 핵심 작업)

목표 100~200현장. 학습 없이 이것만 채워도 "우리 수치는 실사진 기준"이라고 말할 수 있다.

1. 현장당 촬영 프로토콜대로 20~40장(외부 4방향·내부 실별·지붕재 근접).
2. 정답 라벨은 **현장에서 눈으로 확인한 자재**로 적는다(모델 출력 복사 금지).
   - 석면은 확정하지 말고, 사전조사 결과가 있으면 그것을 `gt_asbestos` 로 쓴다.
3. `gt_quantity_ton` 은 **올바로 전자인계서의 실제 처리 실적 톤수**를 쓴다.
   추정치끼리 비교하면 물량 오차를 영원히 못 잡는다.
4. `pred_*` 는 모델 추론 결과로 채운다(`training/infer_test.py`).
5. `python scripts/eval.py --evalset eval_samples/site_evalset.jsonl --domain site`

## 평가 불가 클래스

정답 표본이 0건인 자재는 재현율을 `null` 로 두고 `unevaluated_classes` 에 나열한다.
합산 지표에서 1.0 으로 세어 가리지 않기 위해서다. 현재 학습 데이터가 없는
`GYPSUM_BOARD`(석고보드) · `WATERPROOF_INSULATION`(방수/단열재)이 여기 해당하며,
둘 다 실내 철거 빈출 자재라 실현장 수집으로만 메울 수 있다.
