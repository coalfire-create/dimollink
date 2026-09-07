/*
 * 촬영 코치 — 판정 규칙의 **웹 사본**.
 *
 * 원본은 `packages/shared/src/scan-coach.ts` 다. 이 사이트는 빌드 단계가 없는 정적
 * 페이지라(프레임워크·번들러 0) TS 를 그대로 못 쓴다. 그래서 같은 규칙을 여기 한 벌
 * 더 둔다 — 대신 **둘이 갈라지면 테스트가 깨진다**(vision-web-coach.test.ts 가 같은
 * 표본을 양쪽에 먹여 결과를 비교한다). 사본을 두되 조용히 달라지지는 않게 하는 방식이다.
 *
 * 상수를 여기서 바꾸지 말 것. 원본을 고치면 테스트가 이 파일을 가리킨다.
 */
(function () {
  var DV = (window.DimolVision = window.DimolVision || {});

  var COVERAGE_SECTORS = 12;
  var MAX_ROTATION_DEG_PER_SEC = 40;
  var MIN_ROTATION_DEG_PER_SEC = 3;
  var MAX_FRAME_CHANGE_RATIO = 0.28;
  var MIN_FRAME_CHANGE_RATIO = 0.02;
  var COACH_SHARPNESS_MIN = 60;
  var WARN_SUSTAIN_SECONDS = 0.6;

  function filled(value) {
    var out = [];
    for (var i = 0; i < COVERAGE_SECTORS; i += 1) out.push(value);
    return out;
  }

  function createState() {
    return {
      covered: filled(false),
      blurred: filled(false),
      fastSince: null,
      stillSince: null,
      unsharpSince: null,
      hasAzimuth: false,
      lastElapsed: 0,
    };
  }

  function isTooFast(sample) {
    var byRotation =
      typeof sample.rotationRateDegPerSec === "number" &&
      sample.rotationRateDegPerSec > MAX_ROTATION_DEG_PER_SEC;
    var byFrame =
      typeof sample.frameChangeRatio === "number" &&
      sample.frameChangeRatio > MAX_FRAME_CHANGE_RATIO;
    return byRotation || byFrame;
  }

  function isTooStill(sample) {
    if (typeof sample.frameChangeRatio === "number") {
      return sample.frameChangeRatio < MIN_FRAME_CHANGE_RATIO;
    }
    if (typeof sample.rotationRateDegPerSec === "number") {
      return sample.rotationRateDegPerSec < MIN_ROTATION_DEG_PER_SEC;
    }
    return false;
  }

  function sectorOf(azimuth) {
    var normalized = ((azimuth % 360) + 360) % 360;
    return Math.floor(normalized / (360 / COVERAGE_SECTORS)) % COVERAGE_SECTORS;
  }

  function update(state, sample) {
    var next = {
      covered: state.covered.slice(),
      blurred: state.blurred.slice(),
      fastSince: state.fastSince,
      stillSince: state.stillSince,
      unsharpSince: state.unsharpSince,
      hasAzimuth: state.hasAzimuth,
      lastElapsed: sample.elapsedSeconds,
    };

    var tooFast = isTooFast(sample);
    var tooStill = isTooStill(sample);
    // 빠르면 당연히 흐리므로, 속도 경고와 겹치지 않게 "느린데도 흐린" 경우만 잡는다.
    var unsharp =
      typeof sample.sharpness === "number" && !tooFast && sample.sharpness < COACH_SHARPNESS_MIN;

    next.fastSince = tooFast ? (state.fastSince === null ? sample.elapsedSeconds : state.fastSince) : null;
    next.stillSince = tooStill ? (state.stillSince === null ? sample.elapsedSeconds : state.stillSince) : null;
    next.unsharpSince = unsharp ? (state.unsharpSince === null ? sample.elapsedSeconds : state.unsharpSince) : null;

    if (typeof sample.azimuth === "number") {
      next.hasAzimuth = true;
      var sector = sectorOf(sample.azimuth);
      if (tooFast) {
        if (!next.covered[sector]) next.blurred[sector] = true;
      } else {
        next.covered[sector] = true;
        next.blurred[sector] = false;
      }
    }

    return next;
  }

  function coverageRatio(state) {
    var done = state.covered.filter(Boolean).length;
    return Math.round((done / COVERAGE_SECTORS) * 100) / 100;
  }

  function advise(state, elapsedSeconds, targetSeconds) {
    var elapsed = typeof elapsedSeconds === "number" ? elapsedSeconds : state.lastElapsed;
    var target = typeof targetSeconds === "number" ? targetSeconds : 60;
    var coverage = state.hasAzimuth
      ? coverageRatio(state)
      : Math.min(1, Math.round((elapsed / target) * 100) / 100);

    function sustained(since) {
      return since !== null && state.lastElapsed - since >= WARN_SUSTAIN_SECONDS;
    }

    if (sustained(state.fastSince)) {
      return { level: "warn", message: "너무 빠릅니다 — 천천히 돌려주세요", coverage: coverage };
    }
    if (sustained(state.unsharpSince)) {
      return { level: "warn", message: "초점이 흐립니다 — 잠시 멈춰 초점을 맞춰주세요", coverage: coverage };
    }
    var blurredCount = state.blurred.filter(Boolean).length;
    if (blurredCount > 0) {
      return {
        level: "warn",
        message: "지나친 구간이 " + blurredCount + "곳 있습니다 — 그쪽으로 되돌아가 다시 찍어주세요",
        coverage: coverage,
      };
    }
    if (sustained(state.stillSince)) {
      return { level: "warn", message: "멈춰 있습니다 — 계속 걸으면서 찍어주세요", coverage: coverage };
    }
    if (coverage >= 1) {
      return { level: "good", message: "한 바퀴 완료 — 출발점에서 2~3초 더 찍고 끝내세요", coverage: coverage };
    }
    return {
      level: "ok",
      message: "좋습니다 — 계속 도세요 (" + Math.round(coverage * 100) + "%)",
      coverage: coverage,
    };
  }

  DV.coach = {
    COVERAGE_SECTORS: COVERAGE_SECTORS,
    createState: createState,
    update: update,
    advise: advise,
    coverageRatio: coverageRatio,
    isTooFast: isTooFast,
    isTooStill: isTooStill,
    sectorOf: sectorOf,
  };
})();
