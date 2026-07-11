/*
 * 리포트 렌더링 (VisionReport → DOM). 안전 고지·석면 강조는 항상 노출한다(기획서 §7.1).
 */
(function (root) {
  var DV = (root.DimolVision = root.DimolVision || {});
  var F = DV.format;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function section(title) {
    var s = el("div", "report-section");
    s.appendChild(el("h3", null, title));
    return s;
  }

  function renderProgress(container, activeStage) {
    container.innerHTML = "";
    var stages = DV.taxonomy.stageOrder;
    var activeIdx = stages.indexOf(activeStage);
    stages.forEach(function (stage, idx) {
      var li = el("li", null);
      if (idx < activeIdx) li.classList.add("done");
      else if (idx === activeIdx) li.classList.add("active");
      li.appendChild(el("span", "marker"));
      li.appendChild(el("span", null, F.stageLabel(stage)));
      container.appendChild(li);
    });
  }

  function renderReport(container, report) {
    container.innerHTML = "";

    // 현장 개요
    var summary = section("현장 개요");
    var s = report.site_summary || {};
    summary.appendChild(
      el("p", null, s.building_type + " · " + F.structureLabel(s.structure)),
    );
    if (s.scale_estimate) summary.appendChild(el("p", "hint", s.scale_estimate));
    (s.photo_quality_warnings || []).forEach(function (w) {
      summary.appendChild(el("p", "error-text", "사진 품질: " + w));
    });
    container.appendChild(summary);

    // 위험 요소 (있으면 최상단 강조)
    if (report.hazards && report.hazards.length) {
      var hz = section("위험 요소");
      var hzList = el("ul", "report-list");
      report.hazards.forEach(function (h) {
        var li = el("li", "hazard-item");
        li.appendChild(el("span", "badge", F.hazardLabel(h.type)));
        li.appendChild(el("p", null, h.description));
        if (h.guidance) li.appendChild(el("p", "hint", h.guidance));
        hzList.appendChild(li);
      });
      hz.appendChild(hzList);
      container.appendChild(hz);
    }

    // 인식 자재
    var mat = section("인식 자재");
    var matList = el("ul", "report-list");
    (report.materials || []).forEach(function (m) {
      var li = el("li", null);
      li.appendChild(el("span", "badge", F.materialLabel(m.category)));
      li.appendChild(
        el(
          "p",
          null,
          m.location_note + " · " + F.formatQuantity(m.quantity_estimate),
        ),
      );
      li.appendChild(el("p", "hint", "신뢰도 " + Math.round(m.confidence * 100) + "%"));
      matList.appendChild(li);
    });
    mat.appendChild(matList);
    container.appendChild(mat);

    // 예상 철거 공정 (대략적인 철거 과정 안내)
    var proc = section("예상 철거 공정");
    var procList = el("ol", "report-list");
    (report.process_steps || []).forEach(function (step) {
      var li = el("li", null);
      li.appendChild(el("strong", null, step.order + ". " + step.task_name));
      if (step.estimated_duration)
        li.appendChild(el("p", "hint", "예상 소요: " + step.estimated_duration));
      (step.safety_guidelines || []).forEach(function (g) {
        li.appendChild(el("p", null, "· " + g.text + " [" + g.source_document + "]"));
      });
      procList.appendChild(li);
    });
    proc.appendChild(procList);
    container.appendChild(proc);

    // 폐기물 계획 + 올바로
    var waste = section("폐기물 계획");
    var wasteList = el("ul", "report-list");
    ((report.waste_plan || {}).items || []).forEach(function (w) {
      var li = el("li", null);
      li.appendChild(el("span", "badge", F.materialLabel(w.category)));
      li.appendChild(
        el("p", null, F.formatQuantity(w.estimated_amount) + " · " + w.disposal_method),
      );
      wasteList.appendChild(li);
    });
    waste.appendChild(wasteList);
    waste.appendChild(el("p", "allbaro-flag", F.allbaroText(report.waste_plan)));
    container.appendChild(waste);

    // 법적 고지 (항상 노출)
    container.appendChild(el("p", "disclaimer", report.disclaimer));
  }

  DV.report = { renderProgress: renderProgress, renderReport: renderReport };
})(typeof window !== "undefined" ? window : globalThis);
