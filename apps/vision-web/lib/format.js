/*
 * 순수 포맷 헬퍼 (DOM 비의존 → 단위 테스트 가능).
 */
(function (root) {
  var tax = (root.DimolVision && root.DimolVision.taxonomy) || {};

  function materialLabel(code) {
    return (tax.materialLabels && tax.materialLabels[code]) || code;
  }
  function hazardLabel(type) {
    return (tax.hazardLabels && tax.hazardLabels[type]) || type;
  }
  function structureLabel(code) {
    return (tax.structureLabels && tax.structureLabels[code]) || code;
  }
  function stageLabel(stage) {
    return (tax.stageLabels && tax.stageLabels[stage]) || stage;
  }

  /** 물량/배출량 범위 표기. 확정 수치가 아닌 범위임을 명시(기획서 §2.2). */
  function formatQuantity(q) {
    if (!q) return "";
    var unit = q.unit === "ton" ? "톤" : "㎥";
    if (q.value_min === q.value_max) return "약 " + q.value_min + unit;
    return "약 " + q.value_min + "~" + q.value_max + unit;
  }

  /** 올바로 의무 대상 안내 문구. */
  function allbaroText(wastePlan) {
    if (!wastePlan) return "";
    return wastePlan.allbaro_manifest_required
      ? "올바로 전자인계서 의무 대상 (" + (wastePlan.allbaro_reason || "") + ")"
      : "올바로 전자인계서 의무 대상 아님 (" + (wastePlan.allbaro_reason || "") + ")";
  }

  root.DimolVision = root.DimolVision || {};
  root.DimolVision.format = {
    materialLabel: materialLabel,
    hazardLabel: hazardLabel,
    structureLabel: structureLabel,
    stageLabel: stageLabel,
    formatQuantity: formatQuantity,
    allbaroText: allbaroText,
  };
})(typeof window !== "undefined" ? window : globalThis);
