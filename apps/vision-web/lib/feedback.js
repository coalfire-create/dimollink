/*
 * 피드백 수집 UI + 로직 (기획서 §V5 데이터 플라이휠의 원천).
 *
 * 분석 리포트에 대한 사용자 평가·교정을 모아 Supabase `feedback` 테이블에 넣는다.
 * 이 데이터가 apps/vision-api 의 플라이휠(app/feedback/source.py → retrain_cycle)로 흘러
 * 재학습 신호가 된다. 교정 자재는 학습 계약에 맞춰 "코드 배열"로 만든다
 * (recognition row 의 materials 는 카테고리 코드 목록).
 */
(function (root) {
  var DV = (root.DimolVision = root.DimolVision || {});

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // 리포트에서 인식된 자재 코드(사전 선택용).
  function recognizedCodes(report) {
    return ((report && report.materials) || []).map(function (m) {
      return m.category;
    });
  }

  // 리포트가 석면 의심을 포함하는가(석면 체크박스 사전 선택).
  function reportHasAsbestos(report) {
    return ((report && report.hazards) || []).some(function (h) {
      return h.type === "ASBESTOS_SUSPECT";
    });
  }

  // 사용자가 확정한 자재 코드 + 석면 여부 → 학습이 먹는 corrected_result.
  // materials: 코드 배열(중복 제거), hazards: 석면이면 [ASBESTOS_SUSPECT].
  function buildCorrectedResult(materialCodes, asbestos) {
    var seen = {};
    var materials = [];
    (materialCodes || []).forEach(function (c) {
      if (c && !seen[c]) {
        seen[c] = true;
        materials.push(c);
      }
    });
    return { materials: materials, hazards: asbestos ? ["ASBESTOS_SUSPECT"] : [] };
  }

  // 화면 구성. 반환값의 getState() 로 현재 입력을 읽는다.
  function render(container, report, taxonomy) {
    container.innerHTML = "";
    var labels = (taxonomy && taxonomy.materialLabels) || {};
    var state = { rating: 0 };

    // 안내
    container.appendChild(
      el("p", "hint", "평가는 AI 정확도 개선에만 쓰이며, 리포트 자체를 바꾸지 않습니다."),
    );

    // 1) 별점
    container.appendChild(el("p", "field-label", "이 분석이 정확했나요?"));
    var stars = el("div", "rating");
    stars.setAttribute("role", "radiogroup");
    stars.setAttribute("aria-label", "정확도 평가 (1~5점)");
    var starBtns = [];
    function paint() {
      starBtns.forEach(function (b, idx) {
        var on = idx < state.rating;
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", idx + 1 === state.rating ? "true" : "false");
        b.textContent = on ? "★" : "☆";
      });
    }
    for (var n = 1; n <= 5; n++) {
      (function (value) {
        var b = el("button", "star", "☆");
        b.type = "button";
        b.setAttribute("role", "radio");
        b.setAttribute("aria-label", value + "점");
        b.addEventListener("click", function () {
          state.rating = value;
          paint();
        });
        starBtns.push(b);
        stars.appendChild(b);
      })(n);
    }
    container.appendChild(stars);

    // 2) 자재 교정 (칩 토글, 인식된 것 사전 선택)
    container.appendChild(
      el("p", "field-label", "실제 자재를 골라주세요 (맞으면 그대로 두세요)"),
    );
    var recognized = {};
    recognizedCodes(report).forEach(function (c) {
      recognized[c] = true;
    });
    var chips = el("div", "chips");
    var chipBtns = [];
    Object.keys(labels).forEach(function (code) {
      var b = el("button", "chip", labels[code]);
      b.type = "button";
      b.dataset.code = code;
      var selected = !!recognized[code];
      b.setAttribute("aria-pressed", selected ? "true" : "false");
      if (selected) b.classList.add("selected");
      b.addEventListener("click", function () {
        var now = b.classList.toggle("selected");
        b.setAttribute("aria-pressed", now ? "true" : "false");
      });
      chipBtns.push(b);
      chips.appendChild(b);
    });
    container.appendChild(chips);

    // 3) 석면 의심 확인 (재현율 0.95 목표의 핵심 신호)
    var asbWrap = el("label", "check-row");
    var asb = el("input");
    asb.type = "checkbox";
    asb.checked = reportHasAsbestos(report);
    asbWrap.appendChild(asb);
    asbWrap.appendChild(
      el("span", null, "지붕 슬레이트 등 석면 의심 자재가 있습니다"),
    );
    container.appendChild(asbWrap);

    // 4) 의견 (선택)
    container.appendChild(el("label", "field-label sub", "추가 의견 (선택)"));
    var comment = el("textarea", "text-input");
    comment.rows = 2;
    comment.placeholder = "빠지거나 틀린 부분을 적어주세요";
    container.appendChild(comment);

    function checkedCodes() {
      return chipBtns
        .filter(function (b) {
          return b.classList.contains("selected");
        })
        .map(function (b) {
          return b.dataset.code;
        });
    }

    return {
      getState: function () {
        return {
          rating: state.rating,
          corrected_result: buildCorrectedResult(checkedCodes(), asb.checked),
          comment: comment.value.trim() || undefined,
        };
      },
    };
  }

  DV.feedback = {
    render: render,
    buildCorrectedResult: buildCorrectedResult,
    recognizedCodes: recognizedCodes,
    reportHasAsbestos: reportHasAsbestos,
  };
})(typeof window !== "undefined" ? window : globalThis);
