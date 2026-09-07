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

  /**
   * 사진을 목록에 더한다.
   *
   * 촬영은 한 번에 한두 장씩 여러 번 하게 되므로 **덮어쓰지 않고 누적**한다.
   * (앨범 선택도 같은 규칙 — 방마다 따로 고르는 흐름이 자연스럽다.)
   * 같은 파일을 두 번 넣는 실수는 이름+크기로 걸러낸다.
   */
  function addPhotos(fileList) {
    setError(null);
    var incoming = Array.prototype.slice.call(fileList || []);
    if (!incoming.length) return;

    var tooBig = incoming.filter(function (f) {
      return f.size > config.maxBytesPerPhoto;
    });
    if (tooBig.length) {
      setError("10MB를 넘는 사진이 있습니다. 다시 선택해 주세요.");
      return;
    }

    incoming.forEach(function (f) {
      var duplicate = selectedFiles.some(function (existing) {
        return existing.name === f.name && existing.size === f.size;
      });
      if (!duplicate) selectedFiles.push(f);
    });

    if (selectedFiles.length > config.maxPhotos) {
      selectedFiles = selectedFiles.slice(0, config.maxPhotos);
      setError("사진은 최대 " + config.maxPhotos + "장까지 올릴 수 있어 앞의 " +
               config.maxPhotos + "장만 사용합니다.");
    }
    renderThumbs();
  }

  /** 미리보기 다시 그리기. 각 장을 눌러 뺄 수 있게 한다(잘못 찍은 걸 지울 수 있어야 한다). */
  function renderThumbs() {
    thumbs.innerHTML = "";
    selectedFiles.forEach(function (f, index) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "thumb-btn";
      btn.title = "이 사진 빼기";
      btn.setAttribute("aria-label", index + 1 + "번째 사진 빼기");
      var img = document.createElement("img");
      img.alt = "선택한 현장 사진 미리보기";
      img.src = URL.createObjectURL(f);
      btn.appendChild(img);
      btn.onclick = function () {
        selectedFiles.splice(index, 1);
        renderThumbs();
      };
      thumbs.appendChild(btn);
    });
    el("photo-count").textContent = selectedFiles.length
      ? selectedFiles.length + "장 선택됨 (사진을 누르면 뺄 수 있어요)"
      : "";
    analyzeBtn.disabled = selectedFiles.length === 0;
  }

  ["photo-camera", "photo-input"].forEach(function (id) {
    el(id).addEventListener("change", function (e) {
      addPhotos(e.target.files);
      e.target.value = ""; // 같은 파일을 다시 고를 수 있게 초기화한다.
    });
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
    // 촬영·앨범 두 입력 모두 비운다 — 하나만 비우면 같은 사진이 다시 안 골라진다.
    el("photo-camera").value = "";
    photoInput.value = "";
    renderThumbs();
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
