/*
 * 3D 스캔 클라이언트 — 영상 한 바퀴 → 실측 부피.
 *
 * 흐름: presign → **스토리지로 직접 PUT** → 잡 생성 → 폴링.
 * 영상이 최대 200MB 라 본체 API 로 흘리면 서버가 죽는다. 그래서 업로드만 스토리지로
 * 직접 나가고, 나머지 작은 호출은 자기 오리진의 /api 프록시를 거친다(데모 키 보호).
 */
(function () {
  var DV = (window.DimolVision = window.DimolVision || {});

  /** 영상 상한. 45~60초 1080p 가 보통 60~120MB 라 여유를 둔다. */
  var MAX_VIDEO_BYTES = 200 * 1024 * 1024;
  /** 복원은 20~40분이라 폴링을 촘촘히 할 이유가 없다. */
  var POLL_INTERVAL_MS = 4000;

  async function json(path, options) {
    var res = await fetch(path, options);
    var body = null;
    try {
      body = await res.json();
    } catch (e) {
      body = null;
    }
    if (!res.ok) {
      var err = new Error((body && body.error) || "요청에 실패했습니다.");
      err.status = res.status;
      throw err;
    }
    return body;
  }

  /** 이 배포에서 3D 복원이 실제로 도는지. 목이면 화면이 그렇게 표시해야 한다. */
  DV.scan3dCapability = function () {
    return json("/api/scan3d/capability", { headers: { Accept: "application/json" } }).catch(
      function () {
        return null; // 못 물어봤으면 화면은 "확인 불가"로 둔다 — 실측이라고 단정하지 않는다.
      }
    );
  };

  /**
   * 영상을 올리고 복원 잡을 만든 뒤 끝날 때까지 폴링한다.
   * @param {File|Blob} video
   * @param {object} opts { target, building, steps, onStage, signal }
   */
  DV.submitScan3D = async function (video, opts) {
    opts = opts || {};
    var report = opts.onStage || function () {};

    if (!video || !video.size) throw new Error("영상이 비어 있습니다.");
    if (video.size > MAX_VIDEO_BYTES) {
      throw new Error("영상이 200MB를 넘습니다. 더 짧게(45~60초) 찍어주세요.");
    }
    // MediaRecorder 는 코덱을 붙여 내려준다(예: video/webm;codecs=vp9).
    // presign 검증은 순수 MIME 을 기대하므로 파라미터를 떼고 보낸다.
    var contentType = (video.type || "video/mp4").split(";")[0];

    report("UPLOADING");
    var presigned = await json("/api/scan3d/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ contentType: contentType, contentLength: video.size }),
    });

    // 업로드만 스토리지로 직접 나간다 — 본체를 거치면 200MB 가 서버를 통과한다.
    var put = await fetch(presigned.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: video,
      signal: opts.signal,
    });
    if (!put.ok) {
      throw new Error("영상 업로드에 실패했습니다 (" + put.status + "). 다시 시도해 주세요.");
    }

    var created = await json("/api/scan3d/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        videoKey: presigned.key,
        target: opts.target === "INTERIOR" ? "INTERIOR" : "EXTERIOR",
        building: opts.building || undefined,
        steps: opts.steps || undefined,
      }),
    });

    // 잡 폴링. 복원은 길어서 화면이 단계를 계속 받아야 사용자가 멈춘 줄 알지 않는다.
    for (;;) {
      if (opts.signal && opts.signal.aborted) throw new Error("취소되었습니다.");
      var job = await json("/api/scan3d/jobs/" + encodeURIComponent(created.jobId), {
        headers: { Accept: "application/json" },
      });
      if (job.stage) report(job.stage);
      if (job.status === "COMPLETED") return job;
      if (job.status === "FAILED") {
        throw new Error(job.error || "3D 복원에 실패했습니다. 다시 촬영해 주세요.");
      }
      await new Promise(function (r) {
        setTimeout(r, POLL_INTERVAL_MS);
      });
    }
  };

  DV.MAX_VIDEO_BYTES = MAX_VIDEO_BYTES;
})();
