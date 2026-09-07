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
    scan: el("scan-view"),
    progress: el("progress-view"),
    report: el("report-view"),
    scanReport: el("scan-report-view"),
  };
  function show(name) {
    Object.keys(views).forEach(function (k) {
      views[k].hidden = k !== name;
    });
    window.scrollTo(0, 0);
  }

  /**
   * 사진 분석 ↔ 3D 스캔 전환.
   *
   * 두 흐름은 요구하는 촬영(사진 여러 장 / 영상 한 바퀴)도 결과(자재·공정 / 부피)도 다르다.
   * 한 화면에 섞어두면 무엇을 올려야 하는지 알 수 없어, 아예 갈라 놓는다.
   */
  var mode = "photo";
  function setMode(next) {
    mode = next;
    el("mode-photo").classList.toggle("is-active", next === "photo");
    el("mode-scan").classList.toggle("is-active", next === "scan");
    el("mode-photo").setAttribute("aria-selected", String(next === "photo"));
    el("mode-scan").setAttribute("aria-selected", String(next === "scan"));
    show(next === "photo" ? "upload" : "scan");
  }
  el("mode-photo").addEventListener("click", function () {
    setMode("photo");
  });
  el("mode-scan").addEventListener("click", function () {
    setMode("scan");
  });

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

  // 웹 자체 카메라 — 찍는 도중에 흔들림·초점을 잡아준다([[camera]]).
  // OS 기본 카메라는 화면 위에 아무것도 못 띄우므로 안내를 줄 수 없다.
  el("photo-coach-btn").addEventListener("click", function () {
    DV.openCamera({
      mode: "photo",
      onPhoto: function (blob) {
        var name = "촬영-" + Date.now() + ".jpg";
        addPhotos([new File([blob], name, { type: "image/jpeg" })]);
      },
    });
  });

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
    if (scanAbort) scanAbort.abort();
    el("progress-heading").textContent = "분석 중…";
    setMode(mode);
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

  // ---- 3D 스캔(영상) ----
  var scanFile = null;
  var scanPreview = el("scan-preview");
  var scanError = el("scan-error");
  var scanAbort = null;

  function setScanError(msg) {
    scanError.hidden = !msg;
    scanError.textContent = msg || "";
  }

  /** 이 배포에서 복원이 실제로 도는지 먼저 물어본다 — 목 결과를 실측처럼 보이면 안 된다. */
  DV.scan3dCapability().then(function (cap) {
    var box = el("scan-capability");
    if (!cap) return;
    if (cap.demo) {
      box.hidden = false;
      box.className = "notice is-warn";
      box.textContent =
        "지금은 시연 모드입니다. 촬영·업로드·진행 표시는 실제로 동작하지만, " +
        "부피는 GPU 복원 대신 건축물대장 기준으로 계산한 값이라 실측이 아닙니다.";
    }
  });

  function setScanFile(file, seconds) {
    scanFile = file;
    setScanError(null);
    if (!file) {
      scanPreview.hidden = true;
      el("scan-file-info").textContent = "";
      el("scan-submit-btn").disabled = true;
      return;
    }
    scanPreview.hidden = false;
    scanPreview.src = URL.createObjectURL(file);
    var mb = (file.size / 1024 / 1024).toFixed(1);
    var length = seconds ? Math.round(seconds) + "초 · " : "";
    el("scan-file-info").textContent = length + mb + "MB";
    // 45초 미만은 프레임이 모자라 복원이 자주 깨진다 — 올리기 전에 말해준다.
    if (seconds && seconds < 45) {
      setScanError(
        "촬영이 " + Math.round(seconds) + "초로 짧습니다. 45초 이상 찍어야 복원이 안정적입니다."
      );
    }
    el("scan-submit-btn").disabled = false;
  }

  el("scan-record-btn").addEventListener("click", function () {
    DV.openCamera({
      mode: "video",
      onVideo: function (blob, seconds) {
        var ext = (blob.type || "").indexOf("webm") >= 0 ? "webm" : "mp4";
        setScanFile(new File([blob], "스캔-" + Date.now() + "." + ext, { type: blob.type }), seconds);
      },
    });
  });

  el("video-input").addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > DV.MAX_VIDEO_BYTES) {
      setScanFile(null);
      setScanError("영상이 200MB를 넘습니다. 더 짧게(45~60초) 찍어주세요.");
      return;
    }
    setScanFile(file, null);
    e.target.value = "";
  });

  el("scan-submit-btn").addEventListener("click", function () {
    if (!scanFile) return;
    var target = document.querySelector('input[name="scan-target"]:checked');
    var steps = Number(el("scan-steps").value) || undefined;

    scanAbort = new AbortController();
    show("progress");
    el("progress-heading").textContent = "3D 복원 중…";
    DV.report.renderProgress(el("progress-steps"), "UPLOADING");

    DV.submitScan3D(scanFile, {
      target: target ? target.value : "EXTERIOR",
      steps: steps,
      signal: scanAbort.signal,
      onStage: function (stage) {
        DV.report.renderProgress(el("progress-steps"), stage);
      },
    }).then(
      function (job) {
        renderScanReport(job.result);
        show("scanReport");
      },
      function (err) {
        show("scan");
        setScanError((err && err.message) || "3D 복원에 실패했습니다.");
      }
    );
  });

  /** 3D 결과. 쓸 수 없는 스캔이면 **부피를 앞세우지 않는다** — 틀린 숫자가 더 위험하다. */
  function renderScanReport(result) {
    var body = el("scan-report-body");
    body.innerHTML = "";
    if (!result) {
      body.textContent = "결과를 받지 못했습니다.";
      return;
    }

    var labels = {
      AR_POSE: "AR 포즈 (오차 ±10%)",
      REFERENCE_OBJECT: "기준 물체 (±15%)",
      WALKING_DISTANCE: "보행 거리 (±18%)",
      LEDGER_AREA: "건축물대장 연면적 (±25%)",
      NONE: "없음",
    };

    if (!result.usable) {
      var warn = document.createElement("p");
      warn.className = "notice is-warn";
      warn.textContent =
        "이 스캔은 쓸 수 없습니다. " +
        ((result.reasons || []).join(" ") || "다시 촬영해 주세요.");
      body.appendChild(warn);
    } else {
      var vol = document.createElement("p");
      vol.className = "notice";
      vol.textContent =
        "건물 총 부피 약 " + Math.round(result.grossVolumeM3).toLocaleString("ko-KR") + "㎥";
      body.appendChild(vol);
    }

    var meta = document.createElement("ul");
    meta.className = "steps-list";
    [
      "크기 기준: " + (labels[result.scaleSource] || result.scaleSource),
      "사용 프레임: " + (result.frameCount || 0) + "장",
    ].forEach(function (line) {
      var li = document.createElement("li");
      li.textContent = line;
      meta.appendChild(li);
    });
    body.appendChild(meta);
  }

  el("scan-restart-btn").addEventListener("click", function () {
    setScanFile(null);
    setMode("scan");
  });

  el("prefill-btn").addEventListener("click", function () {
    // TODO(V4): waste_plan → 디몰링크 매칭 신청 프리필 연동(본체 로드맵 도달 후).
    alert("매칭 신청 프리필 연동은 준비 중입니다 (Phase V4).");
  });
})();
