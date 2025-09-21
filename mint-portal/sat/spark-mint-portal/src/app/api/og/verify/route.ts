// src/app/api/og/verify/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { readOrderToken } from "@/lib/order-token";
import { getSigningSecretSync } from "@/lib/signing-secret";
import { looksLikeTxId, looksLikeTokenId, canonicalSparkAddress } from "@/lib/validate";
import { inspectTxBasic, addressHasTxBefore } from "@/lib/verifier";
import { rateLimit } from "@/lib/rate-limit";
import { mintThenTransfer } from "@/lib/mint-flow";
import { claimTxOnce } from "@/lib/tx-once";
import { reserveOgClaim, rollbackOgClaim } from "@/lib/og-store";

function ipKey(req: NextRequest, scope: string){
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  return `${scope}:${ip}`;
}

function envBool(name:string, def=false){
  const s = String(process.env[name] ?? '').trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes') return true;
  if (s === '0' || s === 'false' || s === 'no') return false;
  return def;
}
function pow10(n: bigint) { let r = 1n; for (let i = 0n; i < n; i++) r *= 10n; return r; }
function pickUnits(envUnits?: string, envTokens?: string, envDecimals?: string): bigint | null {
  try { const n = BigInt(String(envUnits ?? '')); if (n > 0n) return n; } catch {}
  if (/^[0-9]+$/.test(String(envTokens ?? '')) && /^[0-9]+$/.test(String(envDecimals ?? ''))) {
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
  const rl = rateLimit(ipKey(req,'og:verify'), 4, 10_000);
  if (!rl.ok) return NextResponse.json({ ok:false, error:'rate_limited', retryAfterMs: rl.retryAfterMs }, { status: 429 });

  try {
    const body = await req.json().catch(()=> ({}));
    const token = String(body?.token || '').trim();
    const txId  = body?.txId ? String(body.txId).trim() : undefined;

    if (!token) return NextResponse.json({ ok:false, error:'missing token' }, { status:400 });
    if (!txId)  return NextResponse.json({ ok:false, error:'tx_required' }, { status:400 });
    if (!looksLikeTxId(txId)) return NextResponse.json({ ok:false, error:'bad txId format' }, { status:400 });

    const payload = readOrderToken(token, getSigningSecretSync());
    if (payload.tier !== 'OG') {
      return NextResponse.json({ ok:false, error:'not_og_token' }, { status:400 });
    }

    const ogEnabled = envBool('PAYMINT_OG_ENABLED', false);
    if (!ogEnabled) return NextResponse.json({ ok:false, error:'og_disabled' }, { status: 400 });

    const basic = await inspectTxBasic(txId);
    if (!basic.ok) return NextResponse.json({ ok:false, error:'og_tx_invalid' }, { status: 400 });

    const cutoff = ogCutoffMs();
    const fromGuess = basic.fromAddress ? canonicalSparkAddress(basic.fromAddress) : null;

    if (basic.timestampMs && basic.timestampMs < cutoff) {
      const fromAddr = fromGuess || null;
      if (!fromAddr) return NextResponse.json({ ok:false, error:'og_tx_invalid_no_from' }, { status: 400 });

      const lock = await reserveOgClaim(fromAddr);
      if (!lock.ok) return NextResponse.json({ ok:false, tier:'OG', error: lock.reason }, { status: 400 });

      const tokenId = process.env.PAYMINT_PAYOUT_TOKEN_ID || null;
      if (!tokenId || !looksLikeTokenId(tokenId)) {
        await rollbackOgClaim(fromAddr);
        return NextResponse.json({ ok:true, minted:false, tier:'OG', reason:'tokenId_missing_or_bad', cutoffMs: cutoff, addr: fromAddr, txTimeMs: basic.timestampMs }, { status: 200 });
      }

      const ogUnits = pickUnits(
        process.env.PAYMINT_OG_PAYOUT_BASEUNITS,
        process.env.PAYMINT_OG_TOKENS,
        process.env.PAYMINT_TOKEN_DECIMALS
      );
      if (!ogUnits) {
        await rollbackOgClaim(fromAddr);
        return NextResponse.json({ ok:true, minted:false, tier:'OG', reason:'payout_baseunits_missing', cutoffMs: cutoff, addr: fromAddr, txTimeMs: basic.timestampMs }, { status: 200 });
      }

      const claim = claimTxOnce(txId, { receiver: fromAddr, amount: String(basic.amountSats ?? 0n) });
      if (!claim.ok) {
        await rollbackOgClaim(fromAddr);
        return NextResponse.json({ ok:false, error:'tx_already_used' }, { status: 409 });
      }

      try {
        const out = await mintThenTransfer({ tokenIdentifier: tokenId, tokenAmount: ogUnits, receiverSparkAddress: fromAddr });
        return NextResponse.json({
          ok:true, minted:true, tier:'OG',
          mintReceiver: fromAddr,
          cutoffMs: cutoff,
          txTimeMs: basic.timestampMs,
          payoutBaseUnits: ogUnits.toString(),
          mintTxId: out.mintTxId, transferTxId: out.transferTxId
        });
      } catch (e:any) {
        await rollbackOgClaim(fromAddr);
        return NextResponse.json({ ok:true, minted:false, tier:'OG', mintReceiver: fromAddr, errorMint:String(e?.message||e), cutoffMs: cutoff, txTimeMs: basic.timestampMs }, { status: 200 });
      }
    }

    if (!fromGuess) {
      return NextResponse.json({ ok:false, error:'og_tx_invalid_no_from' }, { status: 400 });
    }
    const eligible = await addressHasTxBefore(fromGuess, cutoff);
    if (!eligible) {
      return NextResponse.json({ ok:false, error:'og_not_eligible', cutoffMs: cutoff, addr: fromGuess, txTimeMs: basic.timestampMs ?? null }, { status: 400 });
    }

    const lock = await reserveOgClaim(fromGuess);
    if (!lock.ok) {
      return NextResponse.json({ ok:false, tier:'OG', error: lock.reason, cutoffMs: cutoff, addr: fromGuess }, { status: 400 });
    }

    const tokenId = process.env.PAYMINT_PAYOUT_TOKEN_ID || null;
    if (!tokenId || !looksLikeTokenId(tokenId)) {
      await rollbackOgClaim(fromGuess);
      return NextResponse.json({ ok:true, minted:false, tier:'OG', reason:'tokenId_missing_or_bad', cutoffMs: cutoff, addr: fromGuess, txTimeMs: basic.timestampMs ?? null }, { status: 200 });
    }

    const ogUnits2 = pickUnits(
      process.env.PAYMINT_OG_PAYOUT_BASEUNITS,
      process.env.PAYMINT_OG_TOKENS,
      process.env.PAYMINT_TOKEN_DECIMALS
    );
    if (!ogUnits2) {
      await rollbackOgClaim(fromGuess);
      return NextResponse.json({ ok:true, minted:false, tier:'OG', reason:'payout_baseunits_missing', cutoffMs: cutoff, addr: fromGuess, txTimeMs: basic.timestampMs ?? null }, { status: 200 });
    }

    const claim2 = claimTxOnce(txId, { receiver: fromGuess, amount: String(basic.amountSats ?? 0n) });
    if (!claim2.ok) {
      await rollbackOgClaim(fromGuess);
      return NextResponse.json({ ok:false, error:'tx_already_used' }, { status: 409 });
    }

    try {
      const out = await mintThenTransfer({ tokenIdentifier: tokenId, tokenAmount: ogUnits2, receiverSparkAddress: fromGuess });
      return NextResponse.json({
        ok:true, minted:true, tier:'OG',
        mintReceiver: fromGuess,
        cutoffMs: cutoff,
        txTimeMs: basic.timestampMs ?? null,
        payoutBaseUnits: ogUnits2.toString(),
        mintTxId: out.mintTxId, transferTxId: out.transferTxId
      });
    } catch (e:any) {
      await rollbackOgClaim(fromGuess);
      return NextResponse.json({ ok:true, minted:false, tier:'OG', mintReceiver: fromGuess, errorMint:String(e?.message||e), cutoffMs: cutoff, txTimeMs: basic.timestampMs ?? null }, { status: 200 });
    }
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e?.message || e) }, { status: 500 });
  }
}
