"""전국(대한민국) 국가 공간데이터 → 디몰비전 학습 라벨 매핑 (기획서 §4.3 수집표준 확장).

양평 수작업 촬영 한정을 벗어나, 전국 단위 공개/공공 데이터에서 자재 라벨을 뽑는다.

파이프라인(수작업 촬영 없이 전국 약라벨):
  건축물대장 표제부(지붕코드명·주구조코드명)  →  건물별 자재 약라벨(weak label)
  국토지리정보원 VWorld 항공정사영상 API      →  해당 좌표 지붕 top-down 영상
  환경부 석면관리종합정보망(슬레이트 실태조사) →  검증된 슬레이트 정답(면적·준공연도)

⚠️ 서비스 파일럿 지역은 양평 유지(CLAUDE.md 비즈니스 규칙). 여기는 '모델 학습 데이터' 수집이며
   전국을 대상으로 해도 규칙에 위배되지 않는다(일반화 성능 향상 목적).
⚠️ 항공정사영상은 top-down(지붕)이라 지상 촬영과 도메인 갭이 있다. 석면 지붕 인식엔 오히려
   정합적이나(한국 석면 연구도 드론 항공영상 사용), 지상 근접 자재는 앱 플라이휠(§V5)로 보완.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from app.taxonomy import is_asbestos_suspect_material

# 국가 데이터 소스 카탈로그(API 키는 .env 에만, 코드/커밋에 값 금지 — CLAUDE.md).
KOREA_SOURCES: Dict[str, Dict[str, str]] = {
    "building_ledger": {
        "name": "국토교통부 건축HUB 건축물대장정보(표제부)",
        "portal": "data.go.kr/data/15134735/openapi.do",
        "provides": "지붕코드명·주구조코드명·좌표·준공연도(전국 건물)",
        "env_key": "VISION_BLDG_LEDGER_KEY",
        "format": "XML/JSON",
    },
    "vworld_ortho": {
        "name": "국토지리정보원 VWorld 항공정사영상",
        "portal": "vworld.kr (OpenAPI)",
        "provides": "고해상도 항공정사영상 타일(전국 좌표)",
        "env_key": "VISION_VWORLD_KEY",
        "format": "image tile(png/jpg)",
    },
    "asbestos_info": {
        "name": "환경부 석면관리종합정보망 슬레이트 실태조사",
        "portal": "환경부(석면관리종합정보망) — 지자체 보유",
        "provides": "검증된 슬레이트 건물 소재지·슬레이트면적·준공연도(정답 라벨)",
        "env_key": None,  # 오픈API 아님, 협조/다운로드 필요
        "format": "대장/조사표",
    },
}

# 건축물대장 '주구조코드명' → 우리 12종. 표제부 strct_cd_nm 실제 값 기준.
STRUCTURE_TO_CODE: Dict[str, str] = {
    "철근콘크리트구조": "REINFORCED_CONCRETE",
    "철골철근콘크리트구조": "REINFORCED_CONCRETE",
    "프리케스트콘크리트구조": "REINFORCED_CONCRETE",
    "라멘조": "REINFORCED_CONCRETE",
    "철골구조": "METAL",
    "철골철골조": "METAL",
    "경량철골구조": "METAL",
    "강파이프구조": "METAL",
    "벽돌구조": "BRICK_MASONRY",
    "연와조": "BRICK_MASONRY",
    "시멘트블록조": "BRICK_MASONRY",
    "조적구조": "BRICK_MASONRY",
    "석구조": "BRICK_MASONRY",
    "블록구조": "BRICK_MASONRY",
    "목구조": "WOOD",
    "일반목구조": "WOOD",
    "통나무구조": "WOOD",
    "한식목구조": "WOOD",
    "무근콘크리트구조": "PLAIN_CONCRETE",
}

# 건축물대장 '지붕코드명' → 우리 12종. 핵심: 슬레이트 = 석면 의심(공개 라벨 최초 확보 경로).
ROOF_TO_CODE: Dict[str, str] = {
    "슬레이트": "ROOFING_SLATE",
    "석면슬레이트": "ROOFING_SLATE",
    "시멘트기와": "ROOFING_SLATE",  # 상당수 석면 함유(의심 처리 — §7.1 보수적)
    "금속판": "METAL",
    "기와철판": "METAL",
    "함석": "METAL",
    "목재": "WOOD",
    "유리": "GLASS",
    # (철근)콘크리트/스라브 지붕은 주구조와 중복되어 지붕 라벨에선 제외(노이즈 방지).
    # 점토기와/아스팔트슁글/천막 등은 현 12종에 대응 코드 없음 → 미매핑(None).
}


def structure_to_code(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    return STRUCTURE_TO_CODE.get(name.strip())


def roof_to_code(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    return ROOF_TO_CODE.get(name.strip())


def labels_for_building(structure_name: Optional[str], roof_name: Optional[str]) -> List[str]:
    """건물 한 채의 (주구조, 지붕) → 자재 코드 집합(약라벨). 중복 제거."""
    codes: List[str] = []
    for c in (structure_to_code(structure_name), roof_to_code(roof_name)):
        if c and c not in codes:
            codes.append(c)
    return codes


def is_asbestos_building(roof_name: Optional[str]) -> bool:
    """지붕이 석면 의심 자재인지(슬레이트 등). 실태조사 크로스체크·샘플링 우선순위용."""
    code = roof_to_code(roof_name)
    return bool(code and is_asbestos_suspect_material(code))
