"""법정동코드 전개(군 → 말단 리) 검증 (전국 자동수집)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from training.region_codes import (
    SLATE_DENSE_GUN,
    expand_regions,
    fetch_leaf_regions,
    leaf_beopjeong,
)


class _FakeRegcodes:
    """juso 응답을 흉내: 군(집계)·면(집계)·리(말단)·도시동 혼합."""

    def __init__(self, rows):
        self._rows = rows

    def regcodes(self, pattern: str):
        prefix = pattern.rstrip("*")
        return [r for r in self._rows if r["code"].startswith(prefix)]


_ROWS = [
    {"code": "4183000000", "name": "경기도 양평군"},              # 군 집계 → 제외
    {"code": "4183038000", "name": "경기도 양평군 서종면"},        # 면 집계(하위 리 있음) → 제외
    {"code": "4183038021", "name": "경기도 양평군 서종면 문호리"},  # 리 → 말단
    {"code": "4183038022", "name": "경기도 양평군 서종면 정배리"},  # 리 → 말단
    {"code": "1111010100", "name": "서울특별시 종로구 청운동"},     # 도시 동(하위 리 없음) → 말단
]


def test_leaf_selects_ri_for_rural_and_dong_for_urban():
    leaves = leaf_beopjeong(_ROWS)
    codes = {l["code"] for l in leaves}
    assert codes == {"4183038021", "4183038022", "1111010100"}
    # 군/면 집계행은 제외
    assert "4183000000" not in codes and "4183038000" not in codes


def test_leaf_splits_into_ledger_params():
    leaf = [l for l in leaf_beopjeong(_ROWS) if l["code"] == "4183038021"][0]
    assert leaf["sigunguCd"] == "41830" and leaf["bjdongCd"] == "38021"
    assert leaf["name"].endswith("문호리")


def test_fetch_leaf_regions_uses_source():
    leaves = fetch_leaf_regions("41830", source=_FakeRegcodes(_ROWS))
    assert {l["code"] for l in leaves} == {"4183038021", "4183038022"}


def test_expand_regions_dedups_across_gun():
    src = _FakeRegcodes(_ROWS)
    out = expand_regions(["41830", "41830"], source=src)  # 중복 군
    assert len(out) == 2  # 리 2개, 중복 제거


def test_slate_dense_gun_list_is_valid_sigungu_codes():
    assert SLATE_DENSE_GUN and all(len(c) == 5 and c.isdigit() for c in SLATE_DENSE_GUN)
    assert "41830" in SLATE_DENSE_GUN  # 양평(파일럿) 포함
