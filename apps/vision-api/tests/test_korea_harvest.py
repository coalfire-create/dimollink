"""전국(대한민국) 국가데이터 수집 파이프라인 검증 (기획서 §4.3 확장).

양평 한정이 아니라 전국 다지역에서 자재 라벨(특히 석면 슬레이트)을 뽑을 수 있는지,
건축물대장 코드 매핑이 우리 12종으로 정규화되는지 확인한다. GPU/실키 없이 mock 으로.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.harvest_korea import (
    MockBuildingRegistry,
    MockGeocoder,
    MockOrthoImagery,
    harvest,
    lonlat_to_tile,
)
from training.korea_sources import (
    is_asbestos_building,
    labels_for_building,
    roof_to_code,
    structure_to_code,
)


def test_building_ledger_codes_map_to_taxonomy():
    assert structure_to_code("철근콘크리트구조") == "REINFORCED_CONCRETE"
    assert structure_to_code("벽돌구조") == "BRICK_MASONRY"
    assert structure_to_code("일반목구조") == "WOOD"
    assert structure_to_code("철골구조") == "METAL"
    # 핵심: 슬레이트 지붕 = 석면 의심(공개 라벨 최초 확보 경로)
    assert roof_to_code("슬레이트") == "ROOFING_SLATE"
    assert is_asbestos_building("슬레이트") is True
    assert is_asbestos_building("금속판") is False


def test_labels_for_building_dedups_and_combines():
    codes = labels_for_building("벽돌구조", "슬레이트")
    assert codes == ["BRICK_MASONRY", "ROOFING_SLATE"]
    # 미매핑 지붕(점토기와 등)은 무시, 주구조만
    assert labels_for_building("철근콘크리트구조", "점토기와") == ["REINFORCED_CONCRETE"]


def test_harvest_is_nationwide_not_only_yangpyeong(tmp_path):
    regions = ["11110", "26110", "41830", "50110", "47130"]  # 서울·부산·양평·제주·안동
    examples = harvest(regions, str(tmp_path / "img"),
                       MockBuildingRegistry(), MockOrthoImagery())
    seen = {e["meta"]["region"] for e in examples}
    # 전국 5개 지역 모두에서 데이터가 나와야 한다(양평 단일 아님)
    assert seen == set(regions)
    assert len(seen) > 1
    # 스키마: 학습기(train.py)가 그대로 소비하는 형태
    for e in examples:
        assert e["task"] == "recognition"
        assert e["source"] == "korea_building_ledger"
        assert e["materials"]
        assert e["meta"]["label"] == "weak"
        assert Path(e["image"]).exists()


def test_harvest_asbestos_only_filters_slate(tmp_path):
    regions = ["11110", "26110", "41830", "47130"]
    examples = harvest(regions, str(tmp_path / "img"),
                       MockBuildingRegistry(), MockOrthoImagery(),
                       asbestos_only=True)
    assert examples  # 슬레이트 건물이 여러 지역에 존재
    for e in examples:
        assert any(h["type"] == "ASBESTOS_SUSPECT" for h in e["hazards"])
        assert "ROOFING_SLATE" in e["materials"]
    # 석면 표본이 여러 지역에서 모였는지(전국 석면 데이터셋)
    assert len({e["meta"]["region"] for e in examples}) >= 3


def test_vworld_tile_math_is_web_mercator():
    # zoom 1: 원점(0,0)은 4분면 경계 → (1,1)
    assert lonlat_to_tile(0.0, 0.0, 1) == (1, 1)
    # 서울시청(126.978, 37.5665) zoom 18 → 한국 영역의 유효 타일, 결정적
    x, y = lonlat_to_tile(126.9780, 37.5665, 18)
    assert 0 <= x < 2 ** 18 and 0 <= y < 2 ** 18
    assert lonlat_to_tile(126.9780, 37.5665, 18) == (x, y)


class _AddressOnlyRegistry:
    """실 건축물대장처럼 좌표 없이 주소만 주는 레지스트리(지오코딩 필요)."""

    def query(self, region):
        yield {
            "region": region, "lat": None, "lon": None,
            "address": "서울특별시 종로구 자하문로36길 16-14", "address_type": "road",
            "structure": "벽돌구조", "roof": "슬레이트",
            "approval_year": 1985, "pk": f"{region}-addr",
        }


def test_harvest_geocodes_when_registry_gives_only_address(tmp_path):
    # 좌표 없는 건물도 지오코더로 좌표를 채워 항공영상까지 이어져야 한다
    examples = harvest(["11110"], str(tmp_path / "img"),
                       _AddressOnlyRegistry(), MockOrthoImagery(), MockGeocoder())
    assert len(examples) == 1
    e = examples[0]
    assert e["meta"]["lat"] is not None and e["meta"]["lon"] is not None
    assert e["meta"]["address"].startswith("서울")
    assert "ROOFING_SLATE" in e["materials"]


def test_harvest_skips_when_no_coord_and_no_geocoder(tmp_path):
    # 지오코더가 없으면 좌표 없는 건물은 건너뛴다(항공영상 못 받음)
    examples = harvest(["11110"], str(tmp_path / "img"),
                       _AddressOnlyRegistry(), MockOrthoImagery(), geocoder=None)
    assert examples == []


def test_harvest_cli_mock_end_to_end(tmp_path):
    import subprocess

    out = tmp_path / "train_korea.jsonl"
    api_dir = Path(__file__).resolve().parent.parent
    r = subprocess.run(
        [sys.executable, "scripts/harvest_korea.py", "--mock", "--regions", "all",
         "--images", str(tmp_path / "k"), "--out", str(out)],
        cwd=api_dir, capture_output=True, text=True,
    )
    assert r.returncode == 0, r.stderr
    summary = json.loads(r.stdout)
    assert summary["nationwide"] is True
    assert summary["asbestos_suspect_examples"] >= 1
    assert len(summary["regions"]) >= 3
