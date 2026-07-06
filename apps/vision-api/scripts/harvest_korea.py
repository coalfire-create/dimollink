#!/usr/bin/env python3
"""전국 국가데이터 수집 → 디몰비전 학습 JSONL (기획서 §4.3 확장, §V2/V3).

양평 수작업 촬영 없이 전국 건물에서 약라벨 데이터를 만든다:
  건축물대장 표제부(주구조·지붕코드) → 자재 약라벨
  VWorld 항공정사영상 → 좌표별 지붕 top-down 영상
출력은 scripts/prepare_data.py 와 동일 스키마(학습기가 그대로 소비).

실행(실데이터, .env 에 키 필요):
  VISION_BLDG_LEDGER_KEY=... VISION_VWORLD_KEY=... \\
  python scripts/harvest_korea.py --regions 11110,26110,41830 \\
      --images data/korea/images --out data/train_korea.jsonl
배선 검증(키 불필요, 전국 다지역 mock):
  python scripts/harvest_korea.py --mock --regions all --images /tmp/k --out /tmp/k.jsonl

--regions 는 법정동/시군구 코드(쉼표) 또는 'all'(전국 샘플). 석면 슬레이트 우선 샘플링 옵션 제공.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Dict, Iterable, List, Optional, Protocol

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from training.korea_sources import (
    is_asbestos_building,
    labels_for_building,
)
from training.public_datasets import hazards_for


class Building(Dict):
    """건축물대장 한 건: region, lat, lon, structure, roof, approval_year."""


class BuildingRegistry(Protocol):
    def query(self, region: str) -> Iterable[Dict]: ...


class OrthoImagery(Protocol):
    def fetch(self, lat: float, lon: float, out_path: str) -> bool: ...


# ---- 실 클라이언트(키 필요, httpx). 키 없으면 mock 사용. ----
class RealBuildingRegistry:
    """국토교통부 건축HUB 건축물대장 표제부 OpenAPI."""

    ENDPOINT = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo"

    def __init__(self, key: str):
        self.key = key

    def query(self, region: str) -> Iterable[Dict]:
        import httpx

        sigungu, bjdong = region[:5], (region[5:] or "")
        params = {
            "serviceKey": self.key, "sigunguCd": sigungu, "bjdongCd": bjdong,
            "numOfRows": "1000", "_type": "json",
        }
        r = httpx.get(self.ENDPOINT, params=params, timeout=30.0)
        r.raise_for_status()
        items = (r.json().get("response", {}).get("body", {})
                 .get("items", {}).get("item", []))
        for it in items if isinstance(items, list) else [items]:
            yield {
                "region": region,
                "lat": _f(it.get("lat")), "lon": _f(it.get("lon")),
                "structure": it.get("strctCdNm"), "roof": it.get("roofCdNm"),
                "approval_year": _year(it.get("useAprDay")),
                "pk": it.get("mgmBldrgstPk"),
            }


def lonlat_to_tile(lon: float, lat: float, zoom: int) -> "tuple[int, int]":
    """경위도 → WMTS 슬리피 타일 (x, y). VWorld 는 Web Mercator(GoogleMapsCompatible)."""
    import math

    lat = max(min(lat, 85.05112878), -85.05112878)
    n = 2 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


class RealOrthoImagery:
    """국토지리정보원 VWorld 항공정사영상. WMTS 'Satellite' 타일(가장 안정적).

    엔드포인트: https://api.vworld.kr/req/wmts/1.0.0/{KEY}/Satellite/{z}/{y}/{x}.jpeg
    zoom 18~19 면 지붕 판독 가능. VWorld 는 등록 도메인 referer 를 검사할 수 있어
    Referer 헤더를 함께 보낸다(인증키 발급 시 등록한 URL 로 설정).
    """

    def __init__(self, key: str, zoom: int = 18, referer: Optional[str] = None):
        self.key = key
        self.zoom = zoom
        self.referer = referer or os.environ.get("VISION_VWORLD_REFERER", "http://localhost")

    def fetch(self, lat: float, lon: float, out_path: str) -> bool:
        import httpx

        x, y = lonlat_to_tile(lon, lat, self.zoom)
        url = (f"https://api.vworld.kr/req/wmts/1.0.0/{self.key}"
               f"/Satellite/{self.zoom}/{y}/{x}.jpeg")
        try:
            r = httpx.get(url, headers={"Referer": self.referer}, timeout=30.0)
            if r.status_code == 200 and r.content[:3] == b"\xff\xd8\xff":  # jpeg
                with open(out_path, "wb") as f:
                    f.write(r.content)
                return True
        except Exception:
            return False
        return False


# ---- Mock(키 불필요, 전국 다지역). 배선/매핑 검증용. ----
_MOCK_REGIONS = {
    "11110": [("철근콘크리트구조", "(철근)콘크리트"), ("벽돌구조", "슬레이트")],   # 서울 종로
    "26110": [("철골구조", "금속판"), ("목구조", "슬레이트")],                    # 부산 중구
    "41830": [("벽돌구조", "슬레이트"), ("목구조", "목재")],                      # 경기 양평
    "50110": [("철근콘크리트구조", "유리"), ("시멘트블록조", "시멘트기와")],       # 제주
    "47130": [("일반목구조", "슬레이트"), ("연와조", "슬레이트")],                # 경북 안동(농촌 슬레이트 다수)
}


class MockBuildingRegistry:
    def query(self, region: str) -> Iterable[Dict]:
        rows = _MOCK_REGIONS.get(region, [("철근콘크리트구조", "유리")])
        for i, (strct, roof) in enumerate(rows):
            yield {
                "region": region, "lat": 37.0 + i * 0.001, "lon": 127.0 + i * 0.001,
                "structure": strct, "roof": roof, "approval_year": 1988 + i,
                "pk": f"{region}-{i}",
            }


class MockOrthoImagery:
    def fetch(self, lat: float, lon: float, out_path: str) -> bool:
        with open(out_path, "wb") as f:
            f.write(b"\x89PNG\r\n")  # png 헤더 스텁
        return True


def _f(v) -> Optional[float]:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _year(v) -> Optional[int]:
    if v and len(str(v)) >= 4 and str(v)[:4].isdigit():
        return int(str(v)[:4])
    return None


def harvest(regions: List[str], images_dir: str, registry: BuildingRegistry,
            imagery: OrthoImagery, *, asbestos_only: bool = False) -> List[Dict]:
    os.makedirs(images_dir, exist_ok=True)
    examples: List[Dict] = []
    for region in regions:
        for b in registry.query(region):
            if asbestos_only and not is_asbestos_building(b.get("roof")):
                continue
            codes = labels_for_building(b.get("structure"), b.get("roof"))
            if not codes:
                continue
            if b.get("lat") is None or b.get("lon") is None:
                continue
            img_path = os.path.join(images_dir, f"{b['region']}_{b['pk']}.png")
            if not imagery.fetch(b["lat"], b["lon"], img_path):
                continue
            examples.append({
                "image": img_path,
                "materials": codes,
                "hazards": hazards_for(codes),
                "source": "korea_building_ledger",
                "task": "recognition",
                "meta": {
                    "region": b["region"], "lat": b["lat"], "lon": b["lon"],
                    "approval_year": b.get("approval_year"),
                    "label": "weak",  # 건축물대장 기반 약라벨(실태조사로 검증 권장)
                },
            })
    return examples


def _build_clients(mock: bool):
    if mock:
        return MockBuildingRegistry(), MockOrthoImagery()
    bkey = os.environ.get("VISION_BLDG_LEDGER_KEY")
    vkey = os.environ.get("VISION_VWORLD_KEY")
    if not bkey or not vkey:
        raise SystemExit("실수집엔 VISION_BLDG_LEDGER_KEY, VISION_VWORLD_KEY(.env) 필요. "
                         "또는 --mock 으로 배선 검증.")
    return RealBuildingRegistry(bkey), RealOrthoImagery(vkey)


def main() -> int:
    p = argparse.ArgumentParser(description="전국 국가데이터 → 디몰비전 학습 JSONL")
    p.add_argument("--regions", required=True, help="시군구/법정동 코드(쉼표) 또는 'all'")
    p.add_argument("--images", required=True, help="항공영상 저장 디렉토리")
    p.add_argument("--out", required=True, help="출력 JSONL 경로")
    p.add_argument("--mock", action="store_true", help="키 없이 전국 다지역 배선 검증")
    p.add_argument("--asbestos-only", action="store_true", help="석면 의심(슬레이트)만 수집")
    args = p.parse_args()

    if args.regions.strip().lower() == "all":
        regions = list(_MOCK_REGIONS) if args.mock else []
        if not regions:
            raise SystemExit("'all' 실수집은 대상 시군구 코드 목록이 필요합니다(전국 코드표 주입).")
    else:
        regions = [r.strip() for r in args.regions.split(",") if r.strip()]

    registry, imagery = _build_clients(args.mock)
    examples = harvest(regions, args.images, registry, imagery,
                       asbestos_only=args.asbestos_only)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    asbestos = sum(1 for e in examples if any(h["type"] == "ASBESTOS_SUSPECT" for h in e["hazards"]))
    regions_seen = sorted({e["meta"]["region"] for e in examples})
    print(json.dumps({
        "out": args.out, "examples": len(examples),
        "asbestos_suspect_examples": asbestos,
        "regions": regions_seen, "nationwide": len(regions_seen) > 1,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
