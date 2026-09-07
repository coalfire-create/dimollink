/*
 * 웹 자체 카메라 — 촬영하면서 실시간으로 코치한다.
 *
 * OS 기본 카메라(`<input capture>`)는 화면 위에 아무것도 못 띄운다. 그래서 getUserMedia 로
 * 직접 화면을 그린다. 대신 **프레임을 볼 수 있어 센서보다 정확하다** — 초점 흐림은
 * 프레임을 봐야만 알 수 있고, 겹침 부족도 화소 변화율로 직접 잰다.
 *
 * 판정 규칙은 전부 공유 순수 함수([[scan-coach]])에 있다. 여기서는 프레임에서 신호를
 * 뽑아 먹이기만 한다 — 화면마다 기준이 갈라지면 안 된다.
 */
(function () {
  var DV = (window.DimolVision = window.DimolVision || {});

  /** 분석용 축소 해상도. 작을수록 빠르고, 변화율·선명도엔 이 정도로 충분하다. */
  var SAMPLE = 64;
  /** 코치 판정 주기(ms). 더 촘촘해도 판정이 나아지지 않고 배터리만 먹는다. */
  var SAMPLE_INTERVAL_MS = 200;

  function el(id) {
    return document.getElementById(id);
  }

  /** 두 회색조 프레임의 평균 절대차(0~1). 겹침이 부족하면 이 값이 커진다. */
  function frameChangeRatio(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    var sum = 0;
    for (var i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
    return sum / a.length / 255;
  }

  /** RGBA → 회색조 배열. */
  function toGray(data) {
    var gray = new Float32Array(data.length / 4);
    for (var i = 0, p = 0; p < gray.length; i += 4, p += 1) {
      gray[p] = (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    return gray;
  }

  /** 라플라시안 분산 — 값이 클수록 선명. shared 의 computeSharpness 와 같은 규칙. */
  function sharpnessOf(gray, side) {
    var sum = 0;
    var sumSq = 0;
    var n = 0;
    for (var y = 1; y < side - 1; y += 1) {
      for (var x = 1; x < side - 1; x += 1) {
        var c = y * side + x;
        var lap =
          gray[c - side] + gray[c + side] + gray[c - 1] + gray[c + 1] - 4 * gray[c];
        sum += lap;
        sumSq += lap * lap;
        n += 1;
      }
    }
    if (!n) return 0;
    var mean = sum / n;
    return sumSq / n - mean * mean;
  }

  /**
   * 카메라를 연다.
   * @param {object} opts
   * @param {"photo"|"video"} opts.mode 사진 여러 장(자재 분석) / 영상 한 바퀴(3D 스캔)
   * @param {(blob:Blob)=>void} opts.onPhoto 촬영한 사진(photo 모드)
   * @param {(blob:Blob, seconds:number)=>void} opts.onVideo 녹화한 영상(video 모드)
   * @param {()=>void} opts.onClose
   */
  DV.openCamera = function (opts) {
    var mode = opts.mode === "video" ? "video" : "photo";
    var overlay = el("camera-overlay");
    var video = el("camera-video");
    var coachText = el("camera-coach");
    var sectorRow = el("camera-sectors");
    var shutter = el("camera-shutter");
    var closeBtn = el("camera-close");

    var canvas = document.createElement("canvas");
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });

    var stream = null;
    var timer = null;
    var recorder = null;
    var chunks = [];
    var recording = false;
    var prevGray = null;
    var state = DV.coach.createState();
    var startedAt = Date.now();

    function renderSectors() {
      sectorRow.innerHTML = "";
      state.covered.forEach(function (done, i) {
        var cell = document.createElement("span");
        cell.className =
          "camera-sector" +
          (done ? " is-done" : "") +
          (state.blurred[i] ? " is-blurred" : "");
        sectorRow.appendChild(cell);
      });
    }

    function tick() {
      if (!ctx || video.readyState < 2) return;
      // 영상 모드에서는 녹화 중일 때만 판정한다 — 대기 중 경고는 의미가 없다.
      if (mode === "video" && !recording) {
        coachText.textContent = "준비되면 '한 바퀴 촬영 시작'을 누르세요";
        coachText.className = "camera-coach is-ok";
        return;
      }
      ctx.drawImage(video, 0, 0, SAMPLE, SAMPLE);
      var gray = toGray(ctx.getImageData(0, 0, SAMPLE, SAMPLE).data);

      state = DV.coach.update(state, {
        frameChangeRatio: frameChangeRatio(prevGray, gray),
        sharpness: sharpnessOf(gray, SAMPLE),
        elapsedSeconds: (Date.now() - startedAt) / 1000,
      });
      prevGray = gray;

      var advice = DV.coach.advise(state, (Date.now() - startedAt) / 1000);
      coachText.textContent = advice.message;
      coachText.className = "camera-coach is-" + advice.level;
      renderSectors();
    }

    /** 녹화 시작/종료. 영상 모드에서만 쓴다. */
    function toggleRecord() {
      if (!stream) return;
      if (!recording) {
        chunks = [];
        // 브라우저마다 지원 코덱이 다르다. 되는 것을 골라 쓴다.
        var type = ["video/mp4", "video/webm;codecs=vp9", "video/webm"].find(function (t) {
          return window.MediaRecorder && MediaRecorder.isTypeSupported(t);
        });
        recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
        recorder.ondataavailable = function (e) {
          if (e.data && e.data.size) chunks.push(e.data);
        };
        recorder.onstop = function () {
          var blob = new Blob(chunks, { type: recorder.mimeType || "video/mp4" });
          opts.onVideo(blob, (Date.now() - startedAt) / 1000);
        };
        recorder.start();
        recording = true;
        startedAt = Date.now();
        state = DV.coach.createState();
        shutter.textContent = "촬영 종료";
        shutter.classList.add("is-recording");
      } else {
        recording = false;
        shutter.textContent = "한 바퀴 촬영 시작";
        shutter.classList.remove("is-recording");
        if (recorder && recorder.state !== "inactive") recorder.stop();
      }
    }

    function stop() {
      if (recording && recorder && recorder.state !== "inactive") recorder.stop();
      recording = false;
      if (timer) clearInterval(timer);
      timer = null;
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
      overlay.hidden = true;
      if (opts.onClose) opts.onClose();
    }

    /** 현재 화면을 사진으로 저장한다. 미리보기 해상도가 아니라 원본 크기로 뜬다. */
    function capture() {
      var full = document.createElement("canvas");
      full.width = video.videoWidth || 1280;
      full.height = video.videoHeight || 720;
      full.getContext("2d").drawImage(video, 0, 0, full.width, full.height);
      full.toBlob(
        function (blob) {
          if (blob) opts.onPhoto(blob);
        },
        "image/jpeg",
        0.85
      );
    }

    overlay.hidden = false;
    coachText.textContent = "카메라를 준비하는 중…";
    renderSectors();

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then(function (s) {
        stream = s;
        video.srcObject = s;
        return video.play();
      })
      .then(function () {
        startedAt = Date.now();
        timer = setInterval(tick, SAMPLE_INTERVAL_MS);
      })
      .catch(function () {
        // 권한 거부·미지원 — 앨범/기본 카메라로 돌아가면 된다.
        coachText.textContent = "카메라를 열 수 없습니다. 아래 '앨범에서 선택'을 이용해 주세요.";
        coachText.className = "camera-coach is-warn";
      });

    shutter.onclick = mode === "video" ? toggleRecord : capture;
    shutter.textContent = mode === "video" ? "한 바퀴 촬영 시작" : "사진 찍기";
    closeBtn.onclick = stop;

    return { close: stop };
  };
})();
