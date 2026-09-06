/*
 * 주소 선택 — 검색 + 지도 핀 + 건축물대장. 디몰링크 앱의 AddressPickerField 와 같은 흐름.
 *
 * 지도는 디몰링크가 서빙하는 `/map` 페이지를 iframe 으로 띄운다. 지도 SDK 를 여기서
 * 다시 붙이지 않는 이유는 두 가지다 — 카카오 키가 본체에 있고(키를 두 곳에 두지 않는다),
 * 같은 화면을 두 번 만들면 두 서비스의 지도가 서로 달라진다.
 *
 * iframe 계약(map-page.ts): 받는 것 { type:'PAN_TO', lat, lng }
 *                           보내는 것 { type:'MAP_MOVING' } / { type:'MAP_MOVED', lat, lng }
 *
 * 네트워크는 전부 **자기 오리진의 /api 프록시**로 나간다(server.mjs). CORS 가 필요 없고
 * 데모 키가 브라우저에 노출되지 않는다.
 */
(function () {
  var DV = (window.DimolVision = window.DimolVision || {});

  /** 지도 초기 중심 — 서울시청. 사용자가 곧 옮기므로 어디든 무방하다. */
  var DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };

  function el(id) {
    return document.getElementById(id);
  }

  async function getJson(path) {
    var res = await fetch(path, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      var err = new Error("요청 실패");
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  /**
   * 주소 선택기를 만든다.
   * @param {object} opts
   * @param {(info:object|null, facts:string|null)=>void} opts.onLedger 대장 조회 결과 콜백
   */
  DV.createAddressPicker = function (opts) {
    var onLedger = (opts && opts.onLedger) || function () {};

    var input = el("site-address");
    var searchBtn = el("address-search-btn");
    var results = el("address-results");
    var frame = el("map-frame");
    var confirmBtn = el("address-confirm-btn");
    var status = el("ledger-status");

    var picked = null; // { lat, lng }
    var mapReady = false;

    /** 지도가 뜨기 전 들어온 이동 요청은 로드 후에 보낸다. */
    var pending = null;
    frame.addEventListener("load", function () {
      mapReady = true;
      if (pending) {
        panTo(pending.lat, pending.lng);
        pending = null;
      }
    });

    function panTo(lat, lng) {
      if (!mapReady) {
        pending = { lat: lat, lng: lng };
        return;
      }
      frame.contentWindow.postMessage({ type: "PAN_TO", lat: lat, lng: lng }, "*");
    }

    // 지도가 멈추면 그 좌표의 주소를 받아 입력칸을 채운다(핀 찝기).
    window.addEventListener("message", function (event) {
      var data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "MAP_MOVING") {
        // 이동 중에는 확정 버튼을 잠근다 — 옮기는 도중의 좌표로 조회하면 엉뚱한 곳이 나온다.
        confirmBtn.disabled = true;
        input.classList.add("is-stale");
        return;
      }
      if (data.type === "MAP_MOVED") {
        picked = { lat: data.lat, lng: data.lng };
        void reverseGeocode(data.lat, data.lng);
      }
    });

    async function reverseGeocode(lat, lng) {
      try {
        var r = await getJson(
          "/api/locations/coord2address?lat=" + lat + "&lng=" + lng
        );
        input.value = r.roadAddressName || r.addressName || input.value;
        status.textContent = r.buildingName ? "지도 위치: " + r.buildingName : "";
      } catch (e) {
        // 역지오코딩 실패는 흐름을 막지 않는다 — 사용자가 직접 입력해도 된다.
      } finally {
        input.classList.remove("is-stale");
        confirmBtn.disabled = false;
      }
    }

    async function search() {
      var query = input.value.trim();
      if (!query) {
        status.textContent = "주소를 입력해 주세요.";
        return;
      }
      results.innerHTML = "";
      status.textContent = "주소를 찾는 중…";
      try {
        var list = await getJson(
          "/api/locations/search-address?query=" + encodeURIComponent(query)
        );
        if (!list.length) {
          status.textContent = "검색 결과가 없습니다. 지도를 직접 움직여 찝어도 됩니다.";
          return;
        }
        status.textContent = "결과를 고르거나, 지도를 움직여 정확한 위치를 찝어 주세요.";
        list.slice(0, 5).forEach(function (item) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "address-result";
          btn.textContent = item.roadAddressName || item.addressName;
          btn.onclick = function () {
            input.value = item.roadAddressName || item.addressName;
            results.innerHTML = "";
            panTo(item.location.lat, item.location.lng);
          };
          results.appendChild(btn);
        });
      } catch (e) {
        status.textContent = "주소 검색에 실패했습니다. 지도를 직접 움직여 찝어 주세요.";
      }
    }

    /**
     * 확정 — 건축물대장을 조회해 분석의 기준으로 삼는다.
     * 실패해도 분석은 계속된다(대장은 정확도를 올리는 보조 근거이지 필수가 아니다).
     */
    async function confirm() {
      var address = input.value.trim();
      if (!address) {
        status.textContent = "주소를 먼저 지정해 주세요.";
        return;
      }
      status.textContent = "건축물대장을 확인하는 중…";
      try {
        var info = await getJson(
          "/api/locations/building-info?address=" + encodeURIComponent(address)
        );
        onLedger(info, info.visionFacts || null);
        status.textContent = describe(info);
      } catch (e) {
        onLedger(null, null);
        status.textContent =
          e.status === 404
            ? "이 주소의 건축물대장을 찾지 못했습니다. 없이도 분석은 됩니다."
            : "건축물대장 조회를 건너뜁니다. 없이도 분석은 됩니다.";
      }
    }

    /** 조회 결과를 한 줄로 — 사용자가 "맞는 건물인지" 바로 확인할 수 있게. */
    function describe(info) {
      var parts = [
        info.bldNm,
        info.mainPurpsCdNm,
        info.strctCdNm,
        info.totArea ? Math.round(info.totArea) + "㎡" : null,
        info.useAprDay ? info.useAprDay.slice(0, 4) + "년 사용승인" : null,
      ].filter(Boolean);
      return parts.length ? "확인됨 — " + parts.join(" · ") : "대장은 찾았지만 정보가 비어 있습니다.";
    }

    searchBtn.addEventListener("click", function () {
      void search();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        void search();
      }
    });
    confirmBtn.addEventListener("click", function () {
      void confirm();
    });

    // 지도 로드
    frame.src =
      (DV.config.dimollinkWebUrl || "") +
      "/map?lat=" + DEFAULT_CENTER.lat + "&lng=" + DEFAULT_CENTER.lng;

    return { getPicked: function () { return picked; } };
  };
})();
