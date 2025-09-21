// src/lib/verifier.ts
import * as cheerio from "cheerio";
import { fetchJsonWithRetry, fetchTextWithRetry } from "./xfetch";
import { canonicalSparkAddress, reencodeSparkAddr, looksLikeSparkAddress } from "./validate";

function hyphenateTxId(s: string): string {
  const t = (s || "").trim();
  if (t.includes("-")) return t;
  const hex32 = /^[0-9a-f]{32}$/i;
  return hex32.test(t)
    ? `${t.slice(0,8)}-${t.slice(8,12)}-${t.slice(12,16)}-${t.slice(16,20)}-${t.slice(20)}`
    : t;
}

function variants(n: bigint): string[] {
  const s = n.toString();
  const out = new Set([s]);
  const rev = s.split("").reverse();
  const parts: string[] = [];
  for (let i = 0; i < rev.length; i += 3) parts.push(rev.slice(i, i + 3).reverse().join(""));
  const grouped = parts.reverse().join(",");
  out.add(grouped);
  out.add(grouped.replace(/,/g, "."));
  out.add(grouped.replace(/,/g, " "));
  return [...out];
}

const NETWORK = (process.env.SPARK_NETWORK || "MAINNET").toUpperCase();
const MODE = ((process.env.FEE_VERIFIER_MODE || process.env.VERIFIER_MODE || "SPARKSCAN").toUpperCase());

/** ===== Helpers for address normalization & variants ===== */
function canon(addr?: string | null): string | undefined {
  if (!addr) return undefined;
  const a = String(addr).trim();
  return looksLikeSparkAddress(a) ? canonicalSparkAddress(a) : a.toLowerCase();
}
function addrVariants(addr: string): string[] {
  const c = canon(addr) || addr;
  try {
    const spark = reencodeSparkAddr(c, "spark"); 
    return [c, spark];
  } catch { return [c]; }
}

/** === Timestamp helpers === */
function parseDdMmYyyyTime(s: string): number | undefined {
  const m = s.match(/\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})[^\d]+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return undefined;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  const y = Number(yyyy), M = Number(mm), d = Number(dd), H = Number(hh), I = Number(mi), S = Number(ss || "0");
  const t = Date.UTC(y, M - 1, d, H, I, S);
  return Number.isFinite(t) ? t : undefined;
}
function parseTsAny(v: any): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v > 1e12 ? Math.floor(v) : Math.floor(v * 1000);
  if (typeof v === "string" && /^[0-9]+(\.[0-9]+)?$/.test(v.trim())) {
    const n = Number(v); return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000);
  }
  if (typeof v === "string") {
    const p = Date.parse(v); if (!Number.isNaN(p)) return p;
    const t2 = parseDdMmYyyyTime(v); if (t2) return t2;
  }
  return undefined;
}
function pickFirst<T>(...vals: (T | undefined)[]): T | undefined {
  for (const v of vals) if (v !== undefined) return v;
  return undefined;
}
function extractFirstSpLike(s: string): string | undefined {
  const m = s.match(/(?:sp|spark)1[0-9a-z]{20,}/i);
  return m ? canonicalSparkAddress(m[0]) : undefined;
}

/** =================== Verifier =================== */
export async function verifyTxInvolves(
  txId: string,
  feeAddressInput: string,
  opts?: { payer?: string; amount?: bigint; minAmount?: bigint; allowGreater?: boolean }
): Promise<{ ok: boolean; source: "api" | "scrape" | null; reason?: string; amountSats?: bigint; fromAddress?: string }> {
  if (!txId || !feeAddressInput) return { ok: false, source: null, reason: "missing_params" };
  if (MODE === "NONE") return { ok: true, source: null };

  const feeCanon = canon(feeAddressInput)!;                 
  const feeAliases = addrVariants(feeCanon);              

  const payerCanon = canon(opts?.payer || undefined);     

  const candidates = [hyphenateTxId(txId), txId].filter(Boolean);
  for (const id of candidates) {
    try {
      const url = `https://api.sparkscan.io/v1/tx/${encodeURIComponent(id)}?network=${encodeURIComponent(NETWORK)}`;
      const data: any = await fetchJsonWithRetry(url, { retries: 3, backoffMs: 600 });

      const toRaw = String(data?.to?.identifier ?? data?.to ?? "");
      const fromRaw = String(data?.from?.identifier ?? data?.from ?? "");
      const toCanon   = canon(toRaw);
      const fromCanon = canon(fromRaw);

      const status = String(data?.status ?? "").toLowerCase();
      const amount = data?.amountSats != null ? BigInt(String(data.amountSats)) : 0n;

      if (!toCanon || toCanon !== feeCanon) {
        return { ok: false, source: "api", reason: "to_mismatch", amountSats: amount, fromAddress: fromCanon };
      }

      if (payerCanon && (!fromCanon || fromCanon !== payerCanon)) {
        return { ok: false, source: "api", reason: "from_mismatch", amountSats: amount, fromAddress: fromCanon };
      }

      if (opts?.amount != null) {
        if (amount !== opts.amount)
          return { ok: false, source: "api", reason: `amount_mismatch(expected=${opts.amount} got=${amount})`, amountSats: amount, fromAddress: fromCanon };
      } else if (opts?.minAmount != null) {
        if (amount < opts.minAmount)
          return { ok: false, source: "api", reason: `amount_below_min(expected>=${opts.minAmount} got=${amount})`, amountSats: amount, fromAddress: fromCanon };
        if (opts?.allowGreater === false && amount !== opts.minAmount)
          return { ok: false, source: "api", reason: `amount_mismatch_min(expected=${opts.minAmount} got=${amount})`, amountSats: amount, fromAddress: fromCanon };
      }

      if (status && !["confirmed", "completed", "success"].includes(status))
        return { ok: false, source: "api", reason: `bad_status(${status})`, amountSats: amount, fromAddress: fromCanon };

      return { ok: true, source: "api", amountSats: amount, fromAddress: fromCanon };
    } catch {}
  }

  try {
    const canonical = hyphenateTxId(txId);
    const html = await fetchTextWithRetry(`https://www.sparkscan.io/tx/${encodeURIComponent(canonical)}`, { retries: 3, backoffMs: 600 });
    const $ = cheerio.load(html);
    const text = $("body").text() || "";

    if (!feeAliases.some(a => text.includes(a))) return { ok: false, source: "scrape", reason: "no_match_base" };

    if (payerCanon) {
      const payerAliases = addrVariants(payerCanon);
      if (!payerAliases.some(a => text.includes(a))) return { ok: false, source: "scrape", reason: "payer_not_found" };
    }

    if (opts?.amount != null) {
      if (!variants(opts.amount).some(v => text.includes(v))) return { ok: false, source: "scrape", reason: "amount_not_found" };
    } else if (opts?.minAmount != null) {
      if (!variants(opts.minAmount).some(v => text.includes(v))) return { ok: false, source: "scrape", reason: "amount_min_not_found" };
    }

    return { ok: true, source: "scrape" };
  } catch (e: any) {
    return { ok: false, source: "scrape", reason: String(e?.message || e) };
  }
}

export async function verifyIncomingByAddress(
  toAddress: string,
  minAmount: bigint,
  payerAddress?: string
): Promise<boolean> {
  if (!toAddress || minAmount <= 0n) return false;
  if (MODE === "NONE") return true;

  const toAliases = addrVariants(canon(toAddress) || toAddress);
  const payerAliases = payerAddress ? addrVariants(canon(payerAddress)!) : [];

  const html = await fetchTextWithRetry(`https://www.sparkscan.io/address/${encodeURIComponent(toAliases[0])}`, { retries: 3, backoffMs: 600 });
  const $ = cheerio.load(html);
  const text = $("body").text() || "";

  const hasAmt = variants(minAmount).some((v) => text.includes(v));
  if (!hasAmt) return false;

  if (payerAliases.length > 0) return payerAliases.some(a => text.includes(a));
  return true;
}

export async function inspectTxBasic(
  txId: string
): Promise<{ ok: boolean; source: "api" | "scrape" | null; reason?: string; fromAddress?: string; toAddress?: string; amountSats?: bigint; status?: string; timestampMs?: number }> {
  const candidates = [hyphenateTxId(txId), txId].filter(Boolean);

  for (const id of candidates) {
    const url = `https://api.sparkscan.io/v1/tx/${encodeURIComponent(id)}?network=${encodeURIComponent(NETWORK)}`;
    try {
      const data: any = await fetchJsonWithRetry(url, { retries: 3, backoffMs: 600 });

      const to  = canon(String(data?.to?.identifier ?? data?.to ?? "") || undefined);
      const from= canon(String(data?.from?.identifier ?? data?.from ?? "") || undefined);
      const status = String(data?.status ?? "").toLowerCase() || undefined;
      const amount = data?.amountSats != null ? BigInt(String(data.amountSats)) : undefined;

      const ts = pickFirst(
        parseTsAny(data?.timestamp),
        parseTsAny(data?.time),
        parseTsAny(data?.blockTime),
        parseTsAny(data?.block?.timestamp),
        parseTsAny(data?.block?.time),
        parseTsAny(data?.createdAt),
        parseTsAny(data?.confirmedAt),
        parseTsAny(data?.updatedAt)
      );

      if (to || from || amount !== undefined || status || ts) {
        return {
          ok: true,
          source: "api",
          fromAddress: from,
          toAddress: to,
          amountSats: amount,
          status,
          timestampMs: ts
        };
      }
    } catch {}
  }

  try {
    const canonical = hyphenateTxId(txId);
    const html = await fetchTextWithRetry(`https://www.sparkscan.io/tx/${encodeURIComponent(canonical)}`, { retries: 3, backoffMs: 600 });

    let ts = parseTsAny((html.match(/datetime="([^"]+)"/i) || [])[1]);
    if (!ts) {
      const m = html.match(/\b(1[6-9]\d{8}|2\d{9})\b/);
      if (m) ts = parseTsAny(m[1]);
    }
    if (!ts) {
      const m2 = html.match(/\b\d{2}[\/\-]\d{2}[\/\-]\d{4}[^\d]+\d{2}:\d{2}(:\d{2})?\b/);
      if (m2) ts = parseDdMmYyyyTime(m2[0]);
    }

    const fromGuess = extractFirstSpLike(html) || undefined;

    return { ok: true, source: "scrape", fromAddress: fromGuess, toAddress: undefined, amountSats: undefined, status: undefined, timestampMs: ts };
  } catch {}

  return { ok: false, source: null, reason: "not_found" };
}

/** === Holder eligibility (ID / ticker) === */
function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function addressEligibleTokens(
  address: string,
  tokenIdentifiers: string[],
  tokenTickers?: string[]
): Promise<{ matchedIds: string[]; matchedTickers: string[] }> {
  const ids = (tokenIdentifiers || []).map(s => s.trim()).filter(Boolean);
  const tks = (tokenTickers || []).map(s => s.trim()).filter(Boolean);
  if (!ids.length && !tks.length) return { matchedIds: [], matchedTickers: [] };

  try {
    const target = canon(address) || address;
    const j: any = await fetchJsonWithRetry(
      `https://api.sparkscan.io/v1/address/${encodeURIComponent(target)}?network=${encodeURIComponent(NETWORK)}`,
      { retries: 2, backoffMs: 400 }
    );
    const s = JSON.stringify(j || {}).toLowerCase();
    const matchedIds: string[] = [];
    const matchedTickers: string[] = [];
    for (const id of ids) if (id && s.includes(id.toLowerCase())) matchedIds.push(id);
    for (const tk of tks) {
      const re = new RegExp(`(?:^|[^a-z0-9])${escRe(tk)}(?:[^a-z0-9]|$)`, "i");
      if (re.test(s)) matchedTickers.push(tk);
    }
    if (matchedIds.length || matchedTickers.length) return { matchedIds, matchedTickers };
  } catch {}

  try {
    const target = canon(address) || address;
    const html = await fetchTextWithRetry(`https://www.sparkscan.io/address/${encodeURIComponent(target)}`, { retries: 3, backoffMs: 600 });
    const text = html || "";
    const matchedIds: string[] = [];
    for (const id of (tokenIdentifiers || [])) {
      if (id && text.toLowerCase().includes(id.toLowerCase())) matchedIds.push(id);
    }
    const matchedTickers: string[] = [];
    for (const tk of (tokenTickers || [])) {
      if (!tk) continue;
      const re = new RegExp(`(?:^|[^a-z0-9])${escRe(tk)}(?:[^a-z0-9]|$)`, "i");
      if (re.test(text)) matchedTickers.push(tk);
    }
    return { matchedIds, matchedTickers };
  } catch {
    return { matchedIds: [], matchedTickers: [] };
  }
}

export async function addressHasAnyToken(address: string, tokenIdentifiers: string[]): Promise<boolean> {
  const r = await addressEligibleTokens(address, tokenIdentifiers, []);
  return r.matchedIds.length > 0;
}

export async function addressHasTxBefore(address: string, cutoffMs: number): Promise<boolean> {
  try {
    const target = canon(address) || address;
    const url = `https://api.sparkscan.io/v1/address/${encodeURIComponent(target)}/txs?network=${encodeURIComponent(NETWORK)}&limit=50&offset=0`;
    const data: any = await fetchJsonWithRetry(url, { retries: 2, backoffMs: 400 });
    const arr: any[] =
      Array.isArray(data) ? data :
      Array.isArray(data?.items) ? data.items :
      Array.isArray(data?.transactions) ? data.transactions :
      [];

    for (const tx of arr) {
      const ts = pickFirst(
        parseTsAny(tx?.timestamp),
        parseTsAny(tx?.time),
        parseTsAny(tx?.blockTime),
        parseTsAny(tx?.block?.timestamp),
        parseTsAny(tx?.createdAt),
        parseTsAny(tx?.confirmedAt),
        parseTsAny(tx?.updatedAt)
      );
      if (ts && ts < cutoffMs) return true;
    }
  } catch {}

  try {
    const target = canon(address) || address;
    const html = await fetchTextWithRetry(`https://www.sparkscan.io/address/${encodeURIComponent(target)}`, { retries: 2, backoffMs: 400 });

    const isoMatches = [...html.matchAll(/datetime="([^"]+)"/g)];
    for (const m of isoMatches) {
      const ts = parseTsAny(m[1]);
      if (ts && ts < cutoffMs) return true;
    }

    const secMatches = [...html.matchAll(/\b(1[6-9]\d{8}|2\d{9})\b/g)];
    for (const m of secMatches) {
      const ts = parseTsAny(m[1]);
      if (ts && ts < cutoffMs) return true;
    }

    const humanMatches = [...html.matchAll(/\b\d{2}[\/\-]\d{2}[\/\-]\d{4}[^\d]+\d{2}:\d{2}(?::\d{2})?\b/g)];
    for (const m of humanMatches) {
      const ts = parseDdMmYyyyTime(m[0]);
      if (ts && ts < cutoffMs) return true;
    }
  } catch {}

  return false;
}
