import {
  CAPTURE_SLOT_SHORT_LABEL,
  SITE_ANALYSIS_DISCLAIMER,
  buildingFactsForVision,
  coverageWarnings,
  photoQualityWarnings,
  type BuildingLedgerInfo,
  type DetectedMaterial,
  type DemolitionStep,
  type SiteAnalysis,
  type SiteCaptureSlotId,
} from '@dimol/shared';

/**
 * 현장 사진 AI 분석 어댑터 (로드맵 Phase 6).
 * 올바로/포트원과 동일하게 "목 ↔ 실제" 를 인터페이스 뒤에 두고, 키 유무로 선택한다.
 * - MockSiteAnalyzer: 키·비용 없이 동작(파일럿 기본). 결정적 샘플.
 * - ClaudeSiteAnalyzer: 사진을 Claude 비전으로 분석(ANTHROPIC_API_KEY 필요).
 * 결과는 항상 참고용이며 안전 고지(disclaimer)를 포함한다.
 */

export class SiteAnalysisValidationError extends Error {}

/** 한 장의 현장 사진. */
export interface AnalyzeImage {
  imageBase64: string;
  mimeType?: string;
  /**
   * 가이드 촬영 슬롯(정면벽·천장·바닥 등). 어느 부위를 찍은 사진인지 알면
   * 부위별 사전확률을 쓸 수 있다 — 천장엔 텍스 천장재, 바닥엔 장판·타일.
   * 가이드 촬영을 쓰지 않은 사진은 undefined.
   */
  slotId?: SiteCaptureSlotId;
  /**
   * 촬영 시점에 클라이언트가 판정한 품질 미달 사유(흐림·암전·과노출).
   * 흐린 사진은 "안 찍은 것"에 가까우므로 결측과 같은 급으로 다룬다.
   */
  qualityWarnings?: string[];
}

export interface AnalyzeSiteInput {
  /** 현장 사진 base64 (data: 접두사 없는 순수 base64). 단일 촬영 하위호환용. */
  imageBase64?: string;
  /** image/jpeg | image/png 등. 기본 image/jpeg. */
  mimeType?: string;
  /** 여러 각도·거리에서 찍은 현장 사진들(다중 촬영). 있으면 imageBase64 대신 이걸 쓴다. */
  images?: AnalyzeImage[];
  /** 사용자가 덧붙이는 현장 메모(선택) — 분석 힌트. */
  note?: string;
  /** 공공데이터 기반 건축물대장 주구조 정보 (예: 철근콘크리트구조) — 하위호환용 단일 힌트. */
  buildingStructure?: string;
  /**
   * 현장 주소로 미리 조회한 건축물대장 표제부 전체(주용도·구조·층수·연면적·사용승인일).
   * 사진 판독보다 신뢰도가 높은 확정 정보라 프롬프트 앞단에 사실로 주입한다.
   */
  building?: BuildingLedgerInfo;
  /** 현장 주소(표시용). 분석 결과의 대상 현장을 특정하는 데만 쓴다. */
  siteAddress?: string;
}

export interface SiteAnalyzer {
  analyze(input: AnalyzeSiteInput): Promise<SiteAnalysis>;
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** 종합 분석에 쓰는 최대 사진 수(과대 페이로드·비용 방지). */
export const MAX_ANALYZE_IMAGES = 6;

/** 검증을 통과한 이미지 — 슬롯 정보를 그대로 달고 다닌다. */
export interface ValidatedImage {
  imageBase64: string;
  mimeType: string;
  slotId?: SiteCaptureSlotId;
  qualityWarnings?: string[];
}

/** 결측(안 찍힌 부위) + 품질 미달(흐림·암전)을 합친 "확인하지 못한 것" 목록. */
export function analysisCoverageWarnings(
  images: readonly Pick<ValidatedImage, 'slotId' | 'qualityWarnings'>[],
): string[] {
  return [
    ...coverageWarnings({ photoCount: images.length, slotIds: images.map((im) => im.slotId) }),
    ...photoQualityWarnings(images),
  ];
}

/** 공통 입력 검증 — 단일 이미지. */
export function assertValidImage(input: AnalyzeImage): ValidatedImage {
  const imageBase64 = (input.imageBase64 ?? '').replace(/^data:[^,]+,/, '').trim();
  if (imageBase64.length < 100) {
    throw new SiteAnalysisValidationError('현장 사진(imageBase64)이 필요합니다.');
  }
  const mimeType = input.mimeType ?? 'image/jpeg';
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new SiteAnalysisValidationError('지원 형식은 JPEG·PNG·WEBP 입니다.');
  }
  return { imageBase64, mimeType, slotId: input.slotId, qualityWarnings: input.qualityWarnings };
}

/**
 * 입력을 검증된 이미지 배열로 정규화한다(1..MAX). images 가 있으면 우선,
 * 없으면 단일 imageBase64 를 1장짜리로 취급(하위호환). 한 장도 없으면 예외.
 */
export function assertValidImages(input: AnalyzeSiteInput): ValidatedImage[] {
  const raw: AnalyzeImage[] =
    input.images && input.images.length > 0
      ? input.images
      : input.imageBase64
        ? [{ imageBase64: input.imageBase64, mimeType: input.mimeType }]
        : [];
  if (raw.length === 0) {
    throw new SiteAnalysisValidationError('현장 사진(imageBase64)이 필요합니다.');
  }
  return raw.slice(0, MAX_ANALYZE_IMAGES).map((img) => assertValidImage(img));
}

/**
 * 다중 이미지 종합 분석을 안내하는 사용자 지시문 구성.
 *
 * 슬롯(가이드 촬영 부위)을 알면 사진 목록을 부위명과 함께 실어 부위별 사전확률을
 * 쓰게 하고, 빠진 부위는 "판정하지 말고 결측으로 남기라"고 못박는다 — 근거 없는
 * 추정이 그럴듯한 오답으로 나오는 걸 막는 게 목적이다.
 */
export function buildUserInstruction(
  note: string | undefined,
  buildingStructure: string | undefined,
  images: readonly Pick<ValidatedImage, 'slotId' | 'qualityWarnings'>[],
  building?: BuildingLedgerInfo,
): string {
  const imageCount = images.length;
  const multi =
    imageCount > 1
      ? `다음은 같은 철거 현장을 여러 각도·거리에서 촬영한 ${imageCount}장의 사진입니다. ` +
        '모든 사진을 종합해 하나의 결과로 분석하고, 어느 한 장에서만 보이는 소재·위험요소도 놓치지 마세요.\n'
      : '';

  let base = `${multi}${USER_INSTRUCTION}`;

  // 부위를 아는 사진은 목록으로 명시한다(천장/바닥/외벽에 나오는 소재가 서로 다르다).
  const slotted = images
    .map((im, i) => (im.slotId ? `사진 ${i + 1}: ${CAPTURE_SLOT_SHORT_LABEL[im.slotId]}` : null))
    .filter((v): v is string => v !== null);
  if (slotted.length > 0) {
    base +=
      `\n[촬영 부위] ${slotted.join(', ')}. ` +
      '부위에 맞는 소재를 우선 고려하세요 — 천장은 천장재(텍스 등), 바닥은 장판·타일, 외벽은 마감·구조재입니다.';
  }

  // 결측 선언 — 안 찍힌 부위·흐린 사진은 추정하지 말라고 명시한다.
  const missing = analysisCoverageWarnings(images);
  if (missing.length > 0) {
    base +=
      `\n[확인 불가] ${missing.join(' ')} ` +
      '여기에 해당하는 소재·위험요소는 추정하지 말고 결과에서 빼세요. 보이지 않는 것을 지어내지 않는 편이 정확합니다.';
  }

  // 건축물대장 전체 정보가 있으면 그것을 쓰고, 없을 때만 단일 주구조 힌트로 폴백한다.
  const facts = buildingFactsForVision(building);
  if (facts) {
    base += `\n${facts}`;
  } else if (buildingStructure) {
    base += `\n[핵심 힌트] 이 건물의 건축물대장상 주구조는 '${buildingStructure}'입니다. 사진 속 구조물이나 뼈대를 식별할 때 이 정보를 우선적으로 참고하여 오인식을 방지하세요.`;
  }
  if (note) {
    base += `\n[현장 메모] ${note}`;
  }

  return base;
}

/** 결정적 목 — 건설폐기물(철거) 파일럿 범위의 대표 결과. */
export class MockSiteAnalyzer implements SiteAnalyzer {
  async analyze(input: AnalyzeSiteInput): Promise<SiteAnalysis> {
    const images = assertValidImages(input);
    const materials: DetectedMaterial[] = [
      { category: 'CONCRETE', name: '철근콘크리트 벽체·슬래브', confidence: 'MEDIUM', recyclable: true, hazardous: false, note: '순환골재로 재활용 가능', estimatedRatio: 80 },
      { category: 'STEEL', name: '철근·형강', confidence: 'MEDIUM', recyclable: true, hazardous: false, note: '고철로 분리 매각', estimatedRatio: 6 },
      { category: 'BRICK', name: '벽돌·조적 마감', confidence: 'LOW', recyclable: true, hazardous: false, estimatedRatio: 8 },
      { category: 'TILE', name: '욕실 화장실 타일', confidence: 'HIGH', recyclable: false, hazardous: false, estimatedRatio: 2 },
      // 슬레이트는 ROOFING 으로 분류해야 석면 의심 자재 코드(ROOFING_SLATE)로 이어진다.
      // HAZARD 는 MIXED_WASTE 로 떨어져 석면 신호가 사라진다.
      { category: 'ROOFING', name: '슬레이트 지붕(석면 의심)', confidence: 'LOW', recyclable: false, hazardous: true, note: '석면 조사 전 임의 철거 금지 — 전문 업체 위탁', estimatedRatio: 2 },
    ];
    const demolitionSteps: DemolitionStep[] = [
      { order: 1, title: '사전 조사·신고', description: '구조안전 검토와 석면 조사 후 해체계획서·신고를 완료합니다.', caution: '석면 확인 시 지정 업체가 우선 제거' },
      { order: 2, title: '내부 마감재 철거', description: '창호·석고보드·단열재 등 비구조 마감재를 먼저 분리합니다.' },
      { order: 3, title: '지붕·비구조체 해체', description: '지붕재와 비내력벽을 상부에서 하부 순으로 해체합니다.', caution: '석면 슬레이트는 습식·밀봉 후 특별관리' },
      { order: 4, title: '구조체 해체', description: '철근콘크리트 골조를 층별로 해체하며 살수로 분진을 억제합니다.' },
      { order: 5, title: '분리·반출', description: '콘크리트·철근·목재를 종류별로 분리해 반출하고 인계서로 처리합니다.' },
    ];
    return {
      summary: '철근콘크리트 주구조에 조적 마감, 석면 의심 지붕재가 관찰됩니다.',
      materials,
      demolitionSteps,
      hazards: ['석면 의심 지붕재 — 조사 전 철거 금지', '해체 중 구조 붕괴·낙하물 주의', '분진 발생 — 살수·보호구 필수'],
      coverageWarnings: analysisCoverageWarnings(images),
      method: 'MOCK',
      confidence: 'LOW',
      disclaimer: SITE_ANALYSIS_DISCLAIMER,
      analyzedAt: new Date().toISOString(),
    };
  }
}

export interface ClaudeAnalyzerConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  baseUrl?: string;
}

const SYSTEM_PROMPT =
  '당신은 한국의 건설폐기물 철거 현장 분석 보조자입니다. 제공된 현장 사진을 보고 ' +
  '구성 소재와 권장 철거 공정, 위험 요소를 분석합니다. 반드시 지정된 JSON 스키마로만 ' +
  '응답하고, 불확실하면 confidence 를 낮추세요. 석면 등 위험 소재는 hazardous=true 로 표시하고 ' +
  '임의 제거를 권하지 마세요. 타일(TILE)과 목재(WOOD)를 명확히 구분하세요. ' +
  '타일은 매끄러운 광택 표면이나 욕실, 주방, 베란다 등에 주로 쓰이며, 목재는 나무 무늬나 합판 형태이므로 절대 혼동하지 마세요. ' +
  '모든 텍스트는 한국어로 작성합니다.';

const USER_INSTRUCTION =
  '이 철거 현장 사진을 분석해 아래 JSON 스키마로만 답하세요(코드블록·설명 없이 JSON 객체 하나):\n' +
  '{"summary": string, "materials": [{"category": "CONCRETE|STEEL|BRICK|WOOD|GLASS|GYPSUM|INSULATION|ROOFING|TILE|HAZARD|OTHER", "name": string, "estimatedRatio": number, "confidence": "LOW|MEDIUM|HIGH", "recyclable": boolean, "hazardous": boolean, "note"?: string}], "demolitionSteps": [{"order": number, "title": string, "description": string, "caution"?: string}], "hazards": string[], "confidence": "LOW|MEDIUM|HIGH"}\n' +
  '주의: 중량(kg·톤)은 절대 추정하지 마세요. 총 발생량은 건축물대장 연면적으로 서버가 따로 계산합니다.\n' +
  'estimatedRatio 에는 전체 철거 폐기물 중량에서 그 소재가 차지할 대략적인 비율(%, 0~100 정수)만 적으세요. ' +
  '눈에 잘 띄는 마감재보다 구조체(콘크리트·벽돌)가 중량 대부분을 차지한다는 점을 감안하고, 합이 100 근처가 되게 하세요.';

/**
 * 모델 텍스트 응답에서 JSON 을 추출·검증해 SiteAnalysis 로 정규화(공급자 공용).
 * `images` 를 주면 촬영 범위로부터 결측 경고를 함께 채운다.
 */
export function parseVisionJson(
  text: string,
  images: readonly Pick<ValidatedImage, 'slotId' | 'qualityWarnings'>[] = [],
): SiteAnalysis {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 응답 파싱 실패');
  const raw = JSON.parse(text.slice(start, end + 1)) as Partial<SiteAnalysis>;
  const rawMaterials: Partial<DetectedMaterial>[] = Array.isArray(raw.materials)
    ? raw.materials
    : [];

  return {
    summary: typeof raw.summary === 'string' ? raw.summary : '현장 분석 결과',
    materials: rawMaterials.map((m) => ({
      category: m.category,
      name: m.name,
      estimatedRatio:
        typeof m.estimatedRatio === 'number' && m.estimatedRatio > 0
          ? Math.min(100, m.estimatedRatio)
          : undefined,
      confidence: m.confidence,
      recyclable: !!m.recyclable,
      hazardous: !!m.hazardous,
      note: m.note,
    })) as DetectedMaterial[],
    demolitionSteps: Array.isArray(raw.demolitionSteps)
      ? (raw.demolitionSteps as DemolitionStep[])
      : [],
    hazards: Array.isArray(raw.hazards) ? raw.hazards.filter((h): h is string => typeof h === 'string') : [],
    // 결측 선언은 모델 출력이 아니라 촬영 범위·품질에서 계산한다(모델은 자기가 못 본 걸 모른다).
    coverageWarnings: analysisCoverageWarnings(images),
    method: 'AI_VISION',
    confidence: raw.confidence === 'HIGH' || raw.confidence === 'MEDIUM' ? raw.confidence : 'LOW',
    disclaimer: SITE_ANALYSIS_DISCLAIMER,
    analyzedAt: new Date().toISOString(),
  };
}

export interface GeminiAnalyzerConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  baseUrl?: string;
}

/**
 * Google Gemini 비전 분석 — 무료 티어 제공(초기 운영 권장). 실패 시 예외(라우터가 목 폴백).
 * generateContent 에 이미지(inline_data)+지시문을 보내고 JSON 응답을 파싱한다.
 */
export class GeminiSiteAnalyzer implements SiteAnalyzer {
  constructor(private readonly config: GeminiAnalyzerConfig) {}

  async analyze(input: AnalyzeSiteInput): Promise<SiteAnalysis> {
    const images = assertValidImages(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const base = this.config.baseUrl ?? 'https://generativelanguage.googleapis.com';
    try {
      const res = await fetch(
        `${base}/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [
              {
                role: 'user',
                parts: [
                  ...images.map((im) => ({
                    inline_data: { mime_type: im.mimeType, data: im.imageBase64 },
                  })),
                  { text: buildUserInstruction(input.note, input.buildingStructure, images, input.building) },
                ],
              },
            ],
            generationConfig: { maxOutputTokens: 1500, responseMimeType: 'application/json' },
          }),
        },
      );
      if (!res.ok) throw new Error(`gemini ${res.status}`);
      const body = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      return parseVisionJson(text, images);
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface GroqAnalyzerConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  baseUrl?: string;
}

/**
 * Groq 비전 분석 — 무료 티어(카드 불필요). OpenAI 호환 chat/completions.
 * qwen3 계열은 추론(<think>) 모델이라 reasoning_effort:'none' + JSON 강제로 깨끗한 결과를 받는다.
 */
export class GroqSiteAnalyzer implements SiteAnalyzer {
  constructor(private readonly config: GroqAnalyzerConfig) {}

  async analyze(input: AnalyzeSiteInput): Promise<SiteAnalysis> {
    const images = assertValidImages(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const base = this.config.baseUrl ?? 'https://api.groq.com/openai/v1';
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({
          model: this.config.model,
          reasoning_effort: 'none',
          response_format: { type: 'json_object' },
          max_tokens: 1500,
          temperature: 0,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: buildUserInstruction(input.note, input.buildingStructure, images, input.building) },
                ...images.map((im) => ({
                  type: 'image_url' as const,
                  image_url: { url: `data:${im.mimeType};base64,${im.imageBase64}` },
                })),
              ],
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`groq ${res.status}`);
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return parseVisionJson(body.choices?.[0]?.message?.content ?? '', images);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** 실제 Claude 비전 분석 — 실패 시 예외를 던진다(라우터가 목으로 폴백). */
export class ClaudeSiteAnalyzer implements SiteAnalyzer {
  constructor(private readonly config: ClaudeAnalyzerConfig) {}

  async analyze(input: AnalyzeSiteInput): Promise<SiteAnalysis> {
    const images = assertValidImages(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let text: string;
    try {
      const res = await fetch(`${this.config.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 1500,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                ...images.map((im) => ({
                  type: 'image' as const,
                  source: { type: 'base64' as const, media_type: im.mimeType, data: im.imageBase64 },
                })),
                { type: 'text', text: buildUserInstruction(input.note, input.buildingStructure, images, input.building) },
              ],
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}`);
      const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      text = body.content?.find((c) => c.type === 'text')?.text ?? '';
    } finally {
      clearTimeout(timer);
    }
    return parseVisionJson(text, images);
  }
}
