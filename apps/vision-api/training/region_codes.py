"""법정동코드 확보 + 슬레이트 밀집 농촌 지역 선정 (전국 자동수집용).

건축물대장 API 는 (sigunguCd 5자리 + bjdongCd 5자리)로 조회한다. 법정동코드 10자리 =
시도(2)+시군구(3)+읍면동(3)+리(2) 이므로 code[:5], code[5:] 로 분해해 그대로 넣는다.

법정동코드는 juso.dev 공개 API(무키)로 조회한다(행정표준코드관리시스템 기반).
농촌(면·리)일수록 노후 슬레이트 지붕 비율이 높다(서종면 표본 ~10%). 그래서 '군' 지역의
리 단위 법정동을 수집 대상으로 삼는다.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Protocol

JUSO_REGCODE_URL = "https://grpc-proxy-server-mkvo6j4wsq-du.a.run.app/v1/regcodes"

# 슬레이트 밀집 농촌 '군' 시군구코드(5자리). 도명 개편 영향 적은 지역 위주(검증됨).
# 런타임에 juso 로 리 목록을 펼치며, 빈 결과는 자동 skip 되므로 자유롭게 확장 가능.
SLATE_DENSE_GUN: List[str] = [
    "41830",  # 경기 양평군(파일럿)
    "43720",  # 충북 보은군
    "43730",  # 충북 옥천군
    "44760",  # 충남 부여군
    "44790",  # 충남 청양군
    "46770",  # 전남 고흥군
    "46780",  # 전남 보성군
    "46790",  # 전남 화순군
    "47730",  # 경북 의성군
    "47750",  # 경북 청송군
    "48870",  # 경남 함양군
    "48890",  # 경남 합천군
    "50130",  # 제주 서귀포시(농촌 슬레이트 다수)
]


class RegcodeSource(Protocol):
    def regcodes(self, pattern: str) -> List[Dict]: ...


class JusoRegcodeSource:
    """juso.dev 법정동코드 조회(무키). pattern 예: '41830*'."""

    def regcodes(self, pattern: str) -> List[Dict]:
        import httpx

        r = httpx.get(JUSO_REGCODE_URL, params={"regcode_pattern": pattern}, timeout=30.0)
        r.raise_for_status()
        return r.json().get("regcodes", [])


def _is_gun_or_sigungu(code: str) -> bool:
    return code[5:8] == "000"  # 읍면동 자리 없음 = 시군구/군 집계행


def leaf_beopjeong(regcodes: List[Dict]) -> List[Dict]:
    """법정동 목록에서 '건물이 등재되는 말단 법정동'만 추린다.

    - 농촌: 읍면(리 자리=00) 아래 리(리 자리≠00)들이 말단 → 리만.
    - 도시: 동(읍면동≠000, 리=00) 이 말단(하위 리 없음).
    같은 읍면동(code[:8]) 그룹에 리가 하나라도 있으면 그 리들을, 없으면 동 자체를 말단으로.
    """
    by_emd: Dict[str, List[Dict]] = {}
    for rc in regcodes:
        code = rc["code"]
        if _is_gun_or_sigungu(code):
            continue  # 시도/시군구/군 집계행 제외
        by_emd.setdefault(code[:8], []).append(rc)

    leaves: List[Dict] = []
    for emd, group in by_emd.items():
        ri_level = [g for g in group if g["code"][8:10] != "00"]
        chosen = ri_level if ri_level else [g for g in group if g["code"][8:10] == "00"]
        for g in chosen:
            code = g["code"]
            leaves.append({
                "code": code, "name": g["name"],
                "sigunguCd": code[:5], "bjdongCd": code[5:],
            })
    return leaves


def fetch_leaf_regions(gun_code: str, source: Optional[RegcodeSource] = None) -> List[Dict]:
    """군/시군구 코드(5자리) → 말단 법정동 목록[{code,name,sigunguCd,bjdongCd}]."""
    src = source or JusoRegcodeSource()
    return leaf_beopjeong(src.regcodes(f"{gun_code}*"))


def expand_regions(gun_codes: List[str], source: Optional[RegcodeSource] = None) -> List[Dict]:
    """여러 군 코드를 전부 말단 법정동으로 펼친다(중복 제거)."""
    seen = set()
    out: List[Dict] = []
    for gun in gun_codes:
        for leaf in fetch_leaf_regions(gun, source):
            if leaf["code"] not in seen:
                seen.add(leaf["code"])
                out.append(leaf)
    return out
