export const runtime = 'nodejs';

import { NextResponse } from "next/server";

async function fetchJsonRetry(
  url: string,
  { retries = 3, backoffMs = 500 }: { retries?: number; backoffMs?: number } = {}
) {
  let last: any = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "PayMintBot/1.0" },
        cache: "no-store",
      });
      if (r.ok) return await r.json();
      last = new Error(`HTTP ${r.status}`);
      if (r.status < 500 && r.status !== 429) break;
    } catch (e: any) { last = e; }
    await new Promise((res) => setTimeout(res, backoffMs * Math.pow(2, i)));
  }
  throw last || new Error("fetch failed");
}

function readBigWithPresence(obj: any, key: string): {present:boolean, value:bigint|null} {
  const present = obj && Object.prototype.hasOwnProperty.call(obj, key);
  const v = (obj as any)?.[key];
  if (typeof v === "string" && /^[0-9]+$/.test(v)) return {present, value: BigInt(v)};
  if (typeof v === "number" && Number.isFinite(v)) return {present, value: BigInt(Math.trunc(v))};
  return {present, value: null};
}
function pickBigFrom(obj:any, keys:string[]){
  for (const k of keys) {
    const r = readBigWithPresence(obj, k);
    if (r.present) return r;
  }
  return {present:false, value:null};
}
function toPercent(n: bigint, d: bigint): number {
  if (d <= 0n) return 0;
  const pct = (Number(n) / Number(d)) * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}

export async function GET() {
  const tokenId = (process.env.PAYMINT_PAYOUT_TOKEN_ID || "").trim();
  const network = (process.env.SPARK_NETWORK || "MAINNET").trim().toUpperCase();

  const envMaxStr = String(
    (process.env.PAYMINT_PAYOUT_MAX_SUPPLY_BASEUNITS ??
     process.env.NEW_TOKEN_MAX_SUPPLY ??
     "")
  ).trim();

  const envDecimals = Number(
    process.env.PAYMINT_PAYOUT_DECIMALS ??
    process.env.NEW_TOKEN_DECIMALS ??
    ''
  );

  if (!tokenId) {
    return NextResponse.json({ ok: false, error: "tokenId_missing" }, { status: 400 });
  }

  const urls = [
    `https://api.sparkscan.io/v1/token/${encodeURIComponent(tokenId)}?network=${encodeURIComponent(network)}`,
    `https://api.sparkscan.io/v1/tokens/${encodeURIComponent(tokenId)}?network=${encodeURIComponent(network)}`
  ];

  let data: any = null;
  for (const u of urls) {
    try { data = await fetchJsonRetry(u, { retries: 3, backoffMs: 600 }); break; }
    catch { /* try next */ }
  }

  let decimals =
    (typeof data?.decimals === "number" ? data.decimals :
     typeof data?.tokenDecimals === "number" ? data.tokenDecimals :
     Number.isFinite(Number(data?.metadata?.decimals)) ? Number(data.metadata.decimals) :
     Number.isFinite(envDecimals) ? envDecimals : 0);

  const supplyObj = data?.supply ?? data?.tokenSupply ?? data?.Supply ?? data?.metadata?.supply ?? {};
  const mintedRootKeys = ["circulatingSupply","currentSupply","supply","mintedSupply","totalSupply","issuedSupply"];
  const mintedSubKeys  = ["circulating","current","minted","total","issued","amount","value"];
  const maxRootKeys    = ["maxSupply","max_supply","maxSupplyUnits","max_supply_units","maxSupplySats","tokenMaxSupply","cap","maximum"];
  const maxSubKeys     = ["max","maxUnits","cap","maximum","limit"];

  let mintedPresent = false; let mintedVal: bigint = 0n;
  {
    const r1 = pickBigFrom(data ?? {}, mintedRootKeys);
    const r2 = pickBigFrom(supplyObj, mintedSubKeys);
    if (r1.present) { mintedPresent = true; mintedVal = r1.value ?? 0n; }
    else if (r2.present) { mintedPresent = true; mintedVal = r2.value ?? 0n; }
  }

  let maxPresent = false; let maxVal: bigint = 0n;
  {
    const m1 = pickBigFrom(data ?? {}, maxRootKeys);
    const m2 = pickBigFrom(supplyObj, maxSubKeys);
    if (m1.present) { maxPresent = true; maxVal = m1.value ?? 0n; }
    else if (m2.present) { maxPresent = true; maxVal = m2.value ?? 0n; }
  }

  if (!maxPresent && /^[0-9]+$/.test(envMaxStr)) {
    maxPresent = true;
    maxVal = BigInt(envMaxStr);
  }

  if (!mintedPresent && !maxPresent) {
    return NextResponse.json({ ok:false, error:"no_supply_fields", tokenId, network }, { status:200 });
  }

  const hasMax = maxPresent && maxVal > 0n;
  const percent = hasMax ? toPercent(mintedVal, maxVal) : null;

  return NextResponse.json({
    ok: true,
    tokenId,
    network,
    decimals,
    hasMax,
    mintedBaseUnits: mintedVal.toString(),
    maxSupplyBaseUnits: hasMax ? maxVal.toString() : undefined,
    percent
  });
}
