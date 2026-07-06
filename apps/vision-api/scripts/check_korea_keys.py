#!/usr/bin/env python3
"""전국 수집용 API 키 점검 (건축HUB 건축물대장 + VWorld 항공영상).

실제 수집(harvest_korea.py) 전에 키가 살아있는지 각 1콜로 확인한다. 키는 .env 에만.

  # .env 로드 후 실행하거나 환경변수로 직접
  VISION_BLDG_LEDGER_KEY=... VISION_VWORLD_KEY=... python scripts/check_korea_keys.py
  # 특정 좌표로 VWorld 확인(기본: 서울시청 부근)
  python scripts/check_korea_keys.py --lat 37.5665 --lon 126.9780 --save /tmp/tile.jpeg
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _load_dotenv() -> None:
    """의존성 없이 .env 를 얕게 로드(있으면). 값은 프로세스 환경에만."""
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def _mask(key: str) -> str:
    return f"{key[:4]}…{key[-4:]}({len(key)}자)" if key and len(key) > 8 else "(짧음/없음)"


def check_building_ledger(sigungu: str) -> bool:
    import httpx

    key = os.environ.get("VISION_BLDG_LEDGER_KEY", "")
    if not key:
        print("✗ 건축HUB: VISION_BLDG_LEDGER_KEY 없음 (.env)")
        return False
    url = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo"
    params = {"serviceKey": key, "sigunguCd": sigungu, "bjdongCd": "",
              "numOfRows": "1", "_type": "json"}
    try:
        r = httpx.get(url, params=params, timeout=30.0)
        body = r.text
        ok = r.status_code == 200 and ("resultCode" in body) and (
            '"resultCode":"00"' in body.replace(" ", "") or "NORMAL" in body.upper())
        if ok:
            print(f"✓ 건축HUB 건축물대장 OK  키={_mask(key)}  (시군구 {sigungu})")
            return True
        # 흔한 오류: 등록대기/키오류/트래픽초과
        snippet = body[:200].replace("\n", " ")
        print(f"✗ 건축HUB 응답 이상(코드 {r.status_code}): {snippet}")
    except Exception as e:
        print(f"✗ 건축HUB 호출 실패: {e}")
    return False


def check_geocoder(address: str) -> bool:
    from scripts.harvest_korea import RealGeocoder

    key = os.environ.get("VISION_VWORLD_KEY", "")
    if not key:
        return False
    coord = RealGeocoder(key).geocode(address)
    if coord:
        print(f"✓ VWorld 지오코더 OK  '{address}' → 위경도 {coord[0]:.5f},{coord[1]:.5f}")
        return True
    print(f"✗ VWorld 지오코더 실패 — 주소 '{address}' 변환 불가(키/referer 확인)")
    return False


def check_vworld(lat: float, lon: float, save: str) -> bool:
    from scripts.harvest_korea import RealOrthoImagery

    key = os.environ.get("VISION_VWORLD_KEY", "")
    if not key:
        print("✗ VWorld: VISION_VWORLD_KEY 없음 (.env)")
        return False
    ok = RealOrthoImagery(key).fetch(lat, lon, save)
    if ok:
        size = os.path.getsize(save)
        print(f"✓ VWorld 항공영상 OK  키={_mask(key)}  타일 저장 {save} ({size}바이트)")
        return True
    print("✗ VWorld 항공영상 실패 — 키 미승인/도메인(referer) 불일치/트래픽 확인. "
          "VISION_VWORLD_REFERER 를 인증키 발급 시 등록한 URL 로 설정.")
    return False


def main() -> int:
    _load_dotenv()
    p = argparse.ArgumentParser(description="전국 수집 API 키 점검")
    p.add_argument("--sigungu", default="11110", help="건축HUB 확인용 시군구코드(기본 서울 종로)")
    p.add_argument("--lat", type=float, default=37.5665)
    p.add_argument("--lon", type=float, default=126.9780)
    p.add_argument("--save", default="/tmp/vworld_tile.jpeg")
    args = p.parse_args()

    print("== 전국 수집 키 점검 ==")
    a = check_building_ledger(args.sigungu)
    g = check_geocoder("서울특별시 종로구 자하문로36길 16-14")
    b = check_vworld(args.lat, args.lon, args.save)
    print("---")
    if a and g and b:
        print("✅ 세 단계(건축물대장→지오코딩→항공영상) 모두 정상 → 실수집 가능")
        return 0
    print("⚠️ 위 실패 항목을 해결 후 다시 실행. (환경부 석면 실태조사는 별도 신청 — 필수 아님)")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
