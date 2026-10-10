import {
  isDemolitionContractName,
  isPartialDemolition,
  parseAreaM2,
  parseStructure,
  type PublicDemolitionContract,
} from '@dimol/shared';
import { encodeServiceKey } from '../geo/building-registry.js';

/**
 * 조달청_나라장터 계약정보서비스(data.go.kr) — 공사 계약을 계약명으로 검색한다.
 * 키는 data.go.kr 계정 키 하나로 쓰되, 이 서비스에 별도로 '활용신청'이 돼 있어야 한다
 * (안 돼 있으면 SERVICE_KEY_IS_NOT_REGISTERED_ERROR).
 */
const ENDPOINT =
  'https://apis.data.go.kr/1230000/ao/CntrctInfoService/getCntrctInfoListCnstwkPPSSrch';
/** 한 페이지 최대 행 수(data.go.kr 상한). */
const PAGE_SIZE = 999;

export type RawContract = Record<string, unknown>;

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

/**
 * 나라장터의 기관 목록 필드는 "[1^코드^기관명^...]" 처럼 묶여서 온다. 첫 기관명만 꺼낸다.
 */
export function firstPackedName(packed: unknown): string | undefined {
  const s = str(packed);
  if (!s) return undefined;
  const first = s.match(/\[([^\]]*)\]/)?.[1] ?? s;
  const parts = first.split('^');
  return str(parts.length >= 3 ? parts[2] : parts[0]);
}

function isoDate(v: unknown): string | undefined {
  const digits = str(v)?.replace(/\D/g, '');
  if (!digits || digits.length < 8) return undefined;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/**
 * 원본 행 → 정규화. 철거 계약이 아니거나 금액이 없으면 null.
 * 필드명은 서비스 버전에 따라 조금씩 달라 후보를 순서대로 본다.
 */
export function normalizeContract(raw: RawContract): PublicDemolitionContract | null {
  const name = str(raw.cntrctNm);
  if (!name || !isDemolitionContractName(name)) return null;
  const amount = Number(
    String(raw.thtmCntrctAmt ?? raw.totCntrctAmt ?? raw.cntrctAmt ?? '').replace(/,/g, ''),
  );
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const id = str(raw.untyCntrctNo) ?? str(raw.cntrctNo) ?? `${name}|${amount}`;
  return {
    id,
    name,
    amount,
    contractDate: isoDate(raw.cntrctCnclsDate ?? raw.cntrctDate),
    agency: firstPackedName(raw.dminsttList) ?? str(raw.cntrctInsttNm),
    region: str(raw.cnstwkSiteRgnNm) ?? str(raw.cnstrtsiteRgnNm),
    areaM2: parseAreaM2(name),
    structure: parseStructure(name),
    partial: isPartialDemolition(name),
  };
}

/** YYYYMMDDHHMM — 이 서비스는 12자리만 받는다(8자리면 HTTP_ERROR). */
function g2bDateTime(d: Date, endOfDay: boolean): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${endOfDay ? '2359' : '0000'}`;
}

/** 정상 응답은 response, 키·서비스 오류는 OpenAPI_ServiceResponse 로 온다. */
interface G2bResponse {
  OpenAPI_ServiceResponse?: { cmmMsgHeader?: { errMsg?: string; returnAuthMsg?: string } };
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { totalCount?: number | string; items?: RawContract[] | { item?: RawContract | RawContract[] } | '' };
  };
}

interface G2bPage {
  items: RawContract[];
  totalCount: number;
}

export class G2bContractClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 30_000,
  ) {}

  private async page(keyword: string, from: Date, to: Date, pageNo: number): Promise<G2bPage> {
    const query = [
      `serviceKey=${encodeServiceKey(this.apiKey)}`,
      `type=json`,
      `numOfRows=${PAGE_SIZE}`,
      `pageNo=${pageNo}`,
      `inqryDiv=1`,
      `inqryBgnDt=${g2bDateTime(from, false)}`,
      `inqryEndDt=${g2bDateTime(to, true)}`,
      `cntrctNm=${encodeURIComponent(keyword)}`,
    ].join('&');
    const res = await this.fetchImpl(`${ENDPOINT}?${query}`, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = (await res.json()) as G2bResponse;
    const err = body.OpenAPI_ServiceResponse?.cmmMsgHeader;
    if (err) throw new Error(`나라장터 API 오류: ${err.errMsg} (${err.returnAuthMsg})`);
    const header = body.response?.header;
    if (header && header.resultCode !== '00') {
      throw new Error(`나라장터 API 오류: ${header.resultCode} ${header.resultMsg}`);
    }
    const b = body.response?.body ?? {};
    const items = b.items;
    const raw = !items ? [] : Array.isArray(items) ? items : (items.item ?? []);
    return { items: Array.isArray(raw) ? raw : [raw], totalCount: Number(b.totalCount ?? 0) };
  }

  /** 한 기간·한 키워드의 모든 페이지. */
  async search(keyword: string, from: Date, to: Date): Promise<RawContract[]> {
    const out: RawContract[] = [];
    for (let pageNo = 1; ; pageNo++) {
      const { items, totalCount } = await this.page(keyword, from, to, pageNo);
      out.push(...items);
      if (items.length === 0 || out.length >= totalCount) return out;
    }
  }
}

/**
 * 같은 계약은 변경 차수마다 행이 따로 온다. 통합계약번호가 같으면 나중(마지막) 행만 남긴다 —
 * 최종 변경 금액이 실제 집행 금액이다.
 */
export function dedupeContracts(list: PublicDemolitionContract[]): PublicDemolitionContract[] {
  const byId = new Map<string, PublicDemolitionContract>();
  for (const c of list) byId.set(c.id, c);
  return [...byId.values()];
}
