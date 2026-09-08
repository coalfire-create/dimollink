/*
 * 분석 리포트 → 디몰링크 매칭 신청 링크.
 *
 * 두 서비스는 오리진이 다르고 디몰비전 쪽은 로그인이 없다. 그래서 세션이나 공유
 * 저장소를 못 쓰고, 링크 하나에 실어 넘긴다. 형식과 검증 규칙은 디몰링크 쪽 공유
 * 코덱([[request-prefill]])이 단일 원천이고 — 여기는 **만들기만** 한다.
 * 받는 쪽이 화이트리스트로 다시 거르므로, 여기서 잘못 만들면 조용히 버려진다.
 * (그 둘이 갈라지지 않는지는 request-prefill-web.test.ts 가 왕복으로 확인한다.)
 */
(function () {
  var DV = (window.DimolVision = window.DimolVision || {});

  /** 톤 → kg. 리포트는 톤 단위, 요청 폼은 kg 단위다. */
  var TON_TO_KG = 1000;

  /**
   * 추정 범위(min~max)의 대표값. **중앙값을 쓴다** — 최댓값을 쓰면 견적이 과대해지고
   * 최솟값을 쓰면 5톤 의무 기준을 놓친다.
   */
  function representative(estimate) {
    if (!estimate) return 0;
    var min = Number(estimate.value_min) || 0;
    var max = Number(estimate.value_max) || 0;
    return max > min ? (min + max) / 2 : min || max;
  }

  /** 리포트의 waste_plan → 요청 폼 소재 항목(kg). 단위가 톤이 아닌 항목은 버린다. */
  function wasteItemsFrom(report) {
    var plan = (report && report.waste_plan) || {};
    var items = plan.items || [];
    var out = [];
    items.forEach(function (item) {
      var estimate = item.estimated_amount || {};
      // 단위가 톤이 아니면 kg 로 바꿀 근거가 없다 — 넘기지 않는다.
      if (estimate.unit !== "ton") return;
      var kg = Math.round(representative(estimate) * TON_TO_KG);
      if (!(kg > 0)) return;
      out.push({ material: item.category, kg: kg });
    });
    return out;
  }

  /**
   * 프리필 링크를 만든다. 넘길 자재가 하나도 없으면 null —
   * 빈 폼을 열어봐야 사용자가 다시 처음부터 입력해야 한다.
   */
  DV.buildPrefillUrl = function (report, meta) {
    var wasteItems = wasteItemsFrom(report);
    if (!wasteItems.length) return null;

    var payload = { wasteItems: wasteItems };
    if (meta) {
      if (meta.siteAddress) payload.siteAddress = String(meta.siteAddress).slice(0, 200);
      if (meta.buildingType) payload.buildingType = String(meta.buildingType).slice(0, 200);
      var area = Number(meta.floorAreaM2);
      if (area > 0) payload.floorAreaM2 = area;
      var floors = Number(meta.floorCount);
      if (floors > 0) payload.floorCount = floors;
    }
    var plan = report.waste_plan || {};
    if (plan.allbaro_manifest_required === true) payload.allbaroRequired = true;

    var base = (DV.config.dimollinkWebUrl || "").replace(/\/$/, "");
    return base + "/?prefill=" + encodeURIComponent(JSON.stringify(payload));
  };

  DV.prefillWasteItems = wasteItemsFrom; // 테스트에서 쓴다.
})();
