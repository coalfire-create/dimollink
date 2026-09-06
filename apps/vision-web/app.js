/*
 * 화면 컨트롤러 — 업로드 → 진행 → 리포트 전환 및 이벤트 배선.
 */
(function () {
  var DV = window.DimolVision;
  var config = DV.config;
  var client = DV.createClient(config);

  var el = function (id) {
    return document.getElementById(id);
  };
  var views = {
    upload: el("upload-view"),
    progress: el("progress-view"),
    report: el("report-view"),
  };
  function show(name) {
    Object.keys(views).forEach(function (k) {
      views[k].hidden = k !== name;
    });
    window.scrollTo(0, 0);
  }

  var photoInput = el("photo-input");
  var analyzeBtn = el("analyze-btn");
  var uploadError = el("upload-error");
  var thumbs = el("thumbs");
  var selectedFiles = [];

  function setError(msg) {
    if (!msg) {
      uploadError.hidden = true;
      uploadError.textContent = "";
      return;
    }
    uploadError.hidden = false;
    uploadError.textContent = msg;
  }

  photoInput.addEventListener("change", function () {
    setError(null);
    thumbs.innerHTML = "";
    selectedFiles = Array.prototype.slice.call(photoInput.files || []);

    if (selectedFiles.length > config.maxPhotos) {
      setError("사진은 최대 " + config.maxPhotos + "장까지 올릴 수 있습니다.");
      analyzeBtn.disabled = true;
      return;
    }
    var tooBig = selectedFiles.filter(function (f) {
      return f.size > config.maxBytesPerPhoto;
    });
    if (tooBig.length) {
      setError("10MB를 넘는 사진이 있습니다. 다시 선택해 주세요.");
      analyzeBtn.disabled = true;
      return;
    }

    selectedFiles.forEach(function (f) {
      var img = document.createElement("img");
      img.alt = "선택한 현장 사진 미리보기";
      img.src = URL.createObjectURL(f);
      thumbs.appendChild(img);
    });
    analyzeBtn.disabled = selectedFiles.length === 0;
  });

  // 건축물대장(공공데이터) 조회 결과. 디몰링크 본체가 조회해 준 "확정 사실" 문구다.
  var ledgerFacts = null;

  function collectMeta() {
    return {
      building_use: el("building-use").value || undefined,
      floor_area: el("floor-area").value || undefined,
      floors: el("floors").value || undefined,
      site_address: el("site-address").value || undefined,
      // AI 서버가 인식 프롬프트에 "사진보다 신뢰도 높은 확정 정보"로 주입한다.
      ledger_facts: ledgerFacts || undefined,
    };
  }

  // 주소 검색 + 지도 핀 + 건축물대장 — 디몰링크와 같은 흐름([[address]]).
  DV.createAddressPicker({
    onLedger: function (info, facts) {
      ledgerFacts = facts;
      if (!info) return;
      // 대장에서 얻은 값으로 부가 정보를 채운다 — 사용자가 다시 입력하지 않게.
      if (info.mainPurpsCdNm && !el("building-use").value) {
        el("building-use").value = info.mainPurpsCdNm;
      }
      var area = info.totArea || info.vlRatEstmTotArea;
      if (area && !el("floor-area").value) el("floor-area").value = Math.round(area);
      if (info.grndFlrCnt && !el("floors").value) el("floors").value = info.grndFlrCnt;
    },
  });

  analyzeBtn.addEventListener("click", function () {
    if (!selectedFiles.length) return;
    show("progress");
    DV.report.renderProgress(el("progress-steps"), DV.taxonomy.stageOrder[0]);

    client.analyze(selectedFiles, collectMeta(), {
      onStage: function (stage) {
        DV.report.renderProgress(el("progress-steps"), stage);
      },
      onDone: function (report) {
        DV.report.renderReport(el("report-body"), report);
        setupFeedback(report);
        show("report");
      },
      onError: function (err) {
        show("upload");
        setError((err && err.message) || "분석 중 오류가 발생했습니다. 다시 시도해 주세요.");
      },
    });
  });

  el("cancel-btn").addEventListener("click", function () {
    if (client.cancel) client.cancel();
    show("upload");
  });

  // ---- 피드백(데이터 플라이휠 원천, §V5) ----
  var feedbackCtl = null;
  var feedbackSubmit = el("feedback-submit");
  var feedbackStatus = el("feedback-status");

  function setFeedbackStatus(msg, isError) {
    if (!msg) {
      feedbackStatus.hidden = true;
      feedbackStatus.textContent = "";
      feedbackStatus.classList.remove("error-text");
      return;
    }
    feedbackStatus.hidden = false;
    feedbackStatus.textContent = msg;
    feedbackStatus.classList.toggle("error-text", !!isError);
  }

  function setupFeedback(report) {
    feedbackCtl = DV.feedback.render(el("feedback-form"), report, DV.taxonomy);
    feedbackSubmit.disabled = false;
    feedbackSubmit.textContent = "평가 보내기";
    setFeedbackStatus(null);
  }

  feedbackSubmit.addEventListener("click", function () {
    if (!feedbackCtl) return;
    var state = feedbackCtl.getState();
    if (!state.rating) {
      setFeedbackStatus("별점을 먼저 선택해 주세요.", true);
      return;
    }
    feedbackSubmit.disabled = true;
    setFeedbackStatus("보내는 중…", false);
    Promise.resolve(client.submitFeedback(state)).then(
      function () {
        feedbackSubmit.textContent = "평가 완료 · 감사합니다";
        setFeedbackStatus("소중한 평가가 AI 개선에 반영됩니다.", false);
      },
      function (err) {
        feedbackSubmit.disabled = false;
        setFeedbackStatus(
          (err && err.message) || "평가 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
          true,
        );
      },
    );
  });

  el("restart-btn").addEventListener("click", function () {
    selectedFiles = [];
    photoInput.value = "";
    thumbs.innerHTML = "";
    analyzeBtn.disabled = true;
    feedbackCtl = null;
    feedbackSubmit.disabled = true;
    setFeedbackStatus(null);
    show("upload");
  });

  el("prefill-btn").addEventListener("click", function () {
    // TODO(V4): waste_plan → 디몰링크 매칭 신청 프리필 연동(본체 로드맵 도달 후).
    alert("매칭 신청 프리필 연동은 준비 중입니다 (Phase V4).");
  });
})();
