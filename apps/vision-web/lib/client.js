/*
 * 분석 클라이언트 — 업로드→잡 생성→진행 구독→결과 수신을 추상화한다.
 *
 * 실제 흐름(기획서 §3.2): 사진 Storage 직접 업로드(서명 URL) → analyses 행 생성 →
 * Edge Function 이 AI 서버 트리거 → Realtime 으로 진행/결과 구독.
 * 프론트는 AI 서버를 직접 호출하지 않는다(§3.1).
 *
 * 여기서는 목(mock) 구현을 제공해 백엔드 없이 UI 전체 흐름을 검증한다.
 * Supabase 구현은 seam 만 남긴 스텁이다(mock=false + 설정 시 실제 연동).
 */
(function (root) {
  var DV = (root.DimolVision = root.DimolVision || {});
  var STAGES = ["recognition", "guideline_search", "process_generation"];

  var DISCLAIMER =
    "본 자료는 참고용 분석이며, 관계 법령에 따른 해체계획서 및 전문가 검토를 대체하지 않습니다.";
  var ASBESTOS_GUIDANCE = "석면안전관리법에 따른 전문 조사기관 조사 필요";

  function sampleReport() {
    // vision-api mock 파이프라인과 동일 형상의 예시 리포트(파일럿: 저층 주택·슬레이트).
    return {
      site_summary: {
        building_type: "저층 주택",
        structure: "MASONRY",
        scale_estimate: "연면적 약 90~120㎡ 추정(사진 기반, 참고용)",
        photo_quality_warnings: [],
      },
      materials: [
        {
          category: "BRICK_MASONRY",
          confidence: 0.82,
          location_note: "외벽 조적",
          quantity_estimate: { value_min: 6, value_max: 9, unit: "ton" },
        },
        {
          category: "ROOFING_SLATE",
          confidence: 0.71,
          location_note: "지붕 슬레이트로 관찰됨(석면 의심)",
          quantity_estimate: { value_min: 1, value_max: 2, unit: "ton" },
        },
      ],
      hazards: [
        {
          type: "ASBESTOS_SUSPECT",
          description: "슬레이트 지붕재가 관찰되어 석면 함유가 의심됩니다.",
          guidance: ASBESTOS_GUIDANCE,
        },
      ],
      process_steps: [
        {
          order: 1,
          task_name: "사전 조사 및 지장물 처리",
          sub_tasks: ["전기·가스 차단 확인", "석면 전문조사 의뢰 여부 확인"],
          required_equipment: ["개인보호구"],
          required_workforce: "2인",
          estimated_duration: "0.5일",
          safety_guidelines: [
            {
              text: "해체 착공 전 지장물 및 위험요인을 조사한다.",
              source_document: "KOSHA 해체공사 안전보건작업 지침",
            },
          ],
        },
        {
          order: 2,
          task_name: "지붕재 처리(석면 조사 결과 반영)",
          sub_tasks: ["전문 조사기관 결과 확인 후 절차 결정"],
          required_equipment: ["고소작업 안전장비"],
          required_workforce: "전문 인력",
          estimated_duration: "현장 조건에 따름",
          safety_guidelines: [
            {
              text: "석면이 의심되는 자재는 임의 제거하지 않고 전문 조사·처리 절차를 따른다.",
              source_document: "석면안전관리법 관련 고시",
            },
          ],
        },
      ],
      waste_plan: {
        items: [
          {
            category: "BRICK_MASONRY",
            estimated_amount: { value_min: 6, value_max: 9, unit: "ton" },
            disposal_method: "건설폐기물 중간처리업체 위탁",
          },
          {
            category: "ROOFING_SLATE",
            estimated_amount: { value_min: 1, value_max: 2, unit: "ton" },
            disposal_method: "석면 조사 결과에 따라 지정폐기물 절차 적용",
          },
        ],
        allbaro_manifest_required: true,
        allbaro_reason: "건설폐기물 예상 총량 약 9.0톤 — 5톤 이상 의무 대상",
      },
      disclaimer: DISCLAIMER,
      model_version: "mock",
      analyzed_at: new Date().toISOString(),
    };
  }

  function createMockClient() {
    var canceled = false;
    return {
      cancel: function () {
        canceled = true;
      },
      analyze: function (files, meta, handlers) {
        canceled = false;
        var onStage = handlers.onStage || function () {};
        var onDone = handlers.onDone || function () {};
        var i = 0;
        function next() {
          if (canceled) return;
          if (i < STAGES.length) {
            onStage(STAGES[i]);
            i += 1;
            setTimeout(next, 700);
          } else {
            onDone(sampleReport());
          }
        }
        setTimeout(next, 300);
      },
    };
  }

  function createSupabaseClient(config) {
    // 실제 흐름(기획서 §3.2): sign-upload → Storage 직접 업로드 → create-analysis →
    // analyses 행 Realtime 구독으로 stage/result 반영. Edge Functions 배포 필요.
    // ⚠️ 미검증(로컬에 Supabase 프로젝트 없음). 로그인 세션(supabase.auth) 전제.
    var sb = null;
    var channel = null;

    async function ensureClient() {
      if (sb) return sb;
      var mod = await import("https://esm.sh/@supabase/supabase-js@2");
      sb = mod.createClient(config.supabaseUrl, config.supabaseAnonKey);
      return sb;
    }

    async function invoke(name, payload) {
      var client = await ensureClient();
      var res = await client.functions.invoke(name, { body: payload });
      if (res.error) throw new Error(name + " 실패: " + res.error.message);
      return res.data;
    }

    return {
      cancel: function () {
        if (channel && sb) sb.removeChannel(channel);
      },
      analyze: async function (files, meta, handlers) {
        var onStage = handlers.onStage || function () {};
        var onDone = handlers.onDone || function () {};
        var onError = handlers.onError || function () {};
        try {
          var client = await ensureClient();
          // 1) 업로드 서명 URL
          var signed = await invoke("sign-upload", {
            files: files.map(function (f) { return { content_type: f.type }; }),
          });
          // 2) Storage 직접 업로드
          for (var i = 0; i < files.length; i++) {
            var up = signed.uploads[i];
            var r = await client.storage.from(signed.bucket).uploadToSignedUrl(up.path, up.token, files[i]);
            if (r.error) throw new Error("업로드 실패: " + r.error.message);
          }
          // 3) 분석 생성(트리거)
          var created = await invoke("create-analysis", {
            photo_paths: signed.uploads.map(function (u) { return u.path; }),
            input_meta: meta,
          });
          var analysisId = created.analysis_id;
          // 4) Realtime 구독으로 진행/결과 반영
          channel = client
            .channel("analysis-" + analysisId)
            .on(
              "postgres_changes",
              { event: "UPDATE", schema: "public", table: "analyses", filter: "id=eq." + analysisId },
              function (payload) {
                var row = payload.new;
                if (row.status === "done") { onDone(row.result); client.removeChannel(channel); }
                else if (row.status === "failed") { onError(new Error(row.error || "분석 실패")); client.removeChannel(channel); }
                else if (row.stage) { onStage(row.stage); }
              },
            )
            .subscribe();
        } catch (e) {
          onError(e);
        }
      },
    };
  }

  DV.createClient = function (config) {
    var useMock = !config || config.mock || !config.supabaseUrl || !config.supabaseAnonKey;
    return useMock ? createMockClient() : createSupabaseClient(config);
  };
  DV._sampleReport = sampleReport; // 테스트용
})(typeof window !== "undefined" ? window : globalThis);
