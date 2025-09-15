export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { readOrderToken } from "@/lib/order-token";
import { getSigningSecretSync } from "@/lib/signing-secret";
import { looksLikeTxId, looksLikeTokenId } from "@/lib/validate";
import { inspectTxBasic } from "@/lib/verifier";
import { mintThenTransfer } from "@/lib/mint-flow";
import { claimTxOnce } from "@/lib/tx-once";
import { reserveOgClaim, rollbackOgClaim } from "@/lib/og-store";

const SPARK_MAINNET_PREFIX = /^sp1[0-9a-z]{20,}$/i;

function envBool(name:string, def=false){
  const s = String(process.env[name] ?? '').trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'no'  || s === 'off') return false;
  return def;
}
function ensureMainnet(){
  const net = String(process.env.SPARK_NETWORK || "").toUpperCase();
  if (net && net !== "MAINNET") throw new Error("SPARK_NETWORK must be MAINNET");
}
function pow10(n: bigint){ let r=1n; for(let i=0n;i<n;i++) r*=10n; return r; }
function pickUnits(envUnits?: string, envTokens?: string, envDecimals?: string): bigint | null {
  try { const n = BigInt(String(envUnits ?? "")); if (n > 0n) return n; } catch {}
  if (/^[0-9]+$/.test(String(envTokens ?? "")) && /^[0-9]+$/.test(String(envDecimals ?? ""))) {
    const t = BigInt(String(envTokens)); const d = BigInt(String(envDecimals));
    return t * pow10(d);
  }
  return null;
}
function ogCutoffMs(): number {
  const ms = Number(process.env.PAYMINT_OG_CUTOFF_EPOCH_MS);
  if (Number.isFinite(ms) && ms > 0) return Math.floor(ms);
  const iso = String(process.env.PAYMINT_OG_CUTOFF_ISO || "").trim();
  const t = Date.parse(iso);
  if (!Number.isNaN(t)) return t;
  const now = Date.now();
  const j = new Date(now + 7 * 3600_000);
  j.setUTCHours(0, 0, 0, 0);
  return j.getTime() - 7 * 3600_000;
}

export async function POST(req: NextRequest) {
  try {
    ensureMainnet();
    if (!envBool('PAYMINT_OG_ENABLED', false)) {
      return NextResponse.json({ ok:false, error:'og_disabled' }, { status: 400 });
    }

    const body = await req.json().catch(()=> ({}));
    const token = String(body?.token || '').trim();
    const payerHint = String(body?.payerSparkAddress || '').trim() || undefined;
    const txId = body?.txId ? String(body.txId).trim() : undefined;

    if (!token) return NextResponse.json({ ok:false, error:'missing_token' }, { status:400 });
    if (!txId)  return NextResponse.json({ ok:false, error:'tx_required' }, { status:400 });
    if (!looksLikeTxId(txId)) return NextResponse.json({ ok:false, error:'bad txId format' }, { status:400 });

    const payload = readOrderToken(token, getSigningSecretSync()) as any;
    if (String(payload?.tier || '').toUpperCase() !== 'OG') {
      return NextResponse.json({ ok:false, error:'wrong_tier' }, { status: 400 });
    }

    const cutoff = ogCutoffMs();

    const basic = await inspectTxBasic(txId);
    if (!basic.ok) {
      return NextResponse.json({ ok:false, error:'og_tx_invalid' }, { status: 400 });
    }

    const ts = basic.timestampMs ?? null;
    if (!ts || ts >= cutoff) {
      return NextResponse.json({ ok:false, error:'og_not_eligible', cutoffMs: cutoff, txTimeMs: ts }, { status: 400 });
    }

    const fromAddr = (basic.fromAddress && SPARK_MAINNET_PREFIX.test(basic.fromAddress)) ? basic.fromAddress
                   : (payerHint && SPARK_MAINNET_PREFIX.test(payerHint) ? payerHint : null);
    if (!fromAddr) return NextResponse.json({ ok:false, error:'og_tx_invalid_no_from', cutoffMs: cutoff, txTimeMs: ts }, { status: 400 });


    const lock = await reserveOgClaim(fromAddr);
    if (!lock.ok) return NextResponse.json({ ok:false, tier:'OG', error: lock.reason, cutoffMs: cutoff, txTimeMs: ts, addr: fromAddr }, { status: 400 });

    const tokenId = (process.env.PAYMINT_PAYOUT_TOKEN_ID || "").trim();
    if (!looksLikeTokenId(tokenId)) {
      await rollbackOgClaim(fromAddr);
      return NextResponse.json({ ok:true, minted:false, tier:'OG', reason:'tokenId_missing_or_bad', cutoffMs: cutoff, txTimeMs: ts, addr: fromAddr }, { status: 200 });
    }

    const baseUnits = pickUnits(
      process.env.PAYMINT_OG_PAYOUT_BASEUNITS,
      process.env.PAYMINT_OG_TOKENS,
      process.env.PAYMINT_TOKEN_DECIMALS
    );
    if (!baseUnits) {
      await rollbackOgClaim(fromAddr);
      return NextResponse.json({ ok:true, minted:false, tier:'OG', reason:'payout_baseunits_missing', cutoffMs: cutoff, txTimeMs: ts, addr: fromAddr }, { status: 200 });
    }

   
    const claim = claimTxOnce(txId, { receiver: fromAddr, feeAddress: 'any', amount: String(basic.amountSats ?? 0n) });
    if (!claim.ok) {
      await rollbackOgClaim(fromAddr);
      return NextResponse.json({ ok:false, error:'tx_already_used' }, { status: 409 });
    }

    try {
      const out = await mintThenTransfer({
        tokenIdentifier: tokenId,
        tokenAmount: baseUnits,
        receiverSparkAddress: fromAddr
      });
      return NextResponse.json({
        ok:true, minted:true, tier:'OG',
        mintReceiver: fromAddr,
        cutoffMs: cutoff,
        txTimeMs: ts,
        payoutBaseUnits: baseUnits.toString(),
        mintTxId: out.mintTxId, transferTxId: out.transferTxId
      });
    } catch (e:any) {
      await rollbackOgClaim(fromAddr);
      return NextResponse.json({ ok:true, minted:false, tier:'OG', mintReceiver: fromAddr, errorMint:String(e?.message||e), cutoffMs: cutoff, txTimeMs: ts }, { status: 200 });
    }
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e?.message||e) }, { status: 500 });
  }
}
