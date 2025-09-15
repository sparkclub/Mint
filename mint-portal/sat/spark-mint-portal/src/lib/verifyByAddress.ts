import * as cheerio from "cheerio";
import { cfg } from "./config";
import { fetchJsonWithRetry, fetchTextWithRetry } from "./http";

function normMode(): "NONE" | "SCRAPE_SPARKSCAN" {
  const m = String(cfg.verifierMode || "").trim().toUpperCase();
  if (m === "NONE") return "NONE";
  if (m === "SCRAPE_SPARKSCAN" || m === "SPARKSCAN") return "SCRAPE_SPARKSCAN";
  return "SCRAPE_SPARKSCAN";
}

/** Format 32 hex -> UUID 8-4-4-4-12 (kalau sudah ber-hyphen, biarkan) */
export function hyphenateTxId(txId: string): string {
  const s = (txId || "").trim();
  if (!s) return s;
  if (s.includes("-")) return s;
  const hex = s.toLowerCase();
  if (!/^[0-9a-f]{32}$/i.test(hex)) return s;
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
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

export async function verifyTxInvolves(
  txId: string,
  feeAddress: string,
  opts?: { payer?: string; amount?: bigint }
): Promise<{ ok: boolean; source: "api" | "scrape" | null; reason?: string; amountSats?: bigint }> {
  if (!txId || !feeAddress) return { ok: false, source: null, reason: "missing_params" };
  const mode = normMode();
  if (mode === "NONE") return { ok: true, source: null };

  const canonical = hyphenateTxId(txId);
  const net = cfg.network || "MAINNET";
  const url = `https://api.sparkscan.io/v1/tx/${encodeURIComponent(canonical)}?network=${encodeURIComponent(net)}`;

  try {
    const data: any = await fetchJsonWithRetry(url, { retries: 3, backoffMs: 600 });
    const to = String(data?.to?.identifier || "");
    const from = String(data?.from?.identifier || "");
    const status = String(data?.status || "").toLowerCase();
    const amountStr = data?.amountSats !== undefined ? String(data.amountSats) : "";
    const amount = amountStr ? BigInt(amountStr) : 0n;

    if (!to || to.toLowerCase() !== feeAddress.toLowerCase()) return { ok: false, source: "api", reason: "to_mismatch" };
    if (opts?.payer && (!from || from.toLowerCase() !== opts.payer.toLowerCase()))
      return { ok: false, source: "api", reason: "from_mismatch" };
    if (opts?.amount && amount < opts.amount)
      return { ok: false, source: "api", reason: `amount_lt_min(${amount} < ${opts.amount})`, amountSats: amount };
    if (status && !["confirmed", "completed", "success"].includes(status))
      return { ok: false, source: "api", reason: `bad_status(${status})`, amountSats: amount };

    return { ok: true, source: "api", amountSats: amount };
  } catch {
  }

  try {
    const html = await fetchTextWithRetry(
      `https://www.sparkscan.io/tx/${encodeURIComponent(canonical)}`,
      { retries: 3, backoffMs: 600 }
    );
    const $ = cheerio.load(html);
    const text = $("body").text() || "";
    if (!text.includes(canonical) || !text.includes(feeAddress)) return { ok: false, source: "scrape", reason: "no_match_base" };
    if (opts?.payer && !text.includes(opts?.payer)) return { ok: false, source: "scrape", reason: "payer_not_found" };
    if (opts?.amount && !variants(opts.amount).some((v) => text.includes(v)))
      return { ok: false, source: "scrape", reason: "amount_not_found" };
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
  const mode = normMode();
  if (mode === "NONE") return true;

  const html = await fetchTextWithRetry(
    `https://www.sparkscan.io/address/${encodeURIComponent(toAddress)}`,
    { retries: 3, backoffMs: 600 }
  );
  const $ = cheerio.load(html);
  const text = $("body").text() || "";
  const hasAmt = variants(minAmount).some((v) => text.includes(v));
  if (!hasAmt) return false;
  if (payerAddress) return text.includes(payerAddress);
  return true;
}

export const VerifyBy = { verifyTxInvolves, verifyIncomingByAddress, hyphenateTxId };
