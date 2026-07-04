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

  function collectMeta() {
    return {
      building_use: el("building-use").value || undefined,
      floor_area: el("floor-area").value || undefined,
      floors: el("floors").value || undefined,
    };
  }

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

  el("restart-btn").addEventListener("click", function () {
    selectedFiles = [];
    photoInput.value = "";
    thumbs.innerHTML = "";
    analyzeBtn.disabled = true;
    show("upload");
  });

  el("prefill-btn").addEventListener("click", function () {
    // TODO(V4): waste_plan → 디몰링크 매칭 신청 프리필 연동(본체 로드맵 도달 후).
    alert("매칭 신청 프리필 연동은 준비 중입니다 (Phase V4).");
  });
})();
