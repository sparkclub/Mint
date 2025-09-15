export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { readOrderToken } from "@/lib/order-token";
import { getSigningSecretSync } from "@/lib/signing-secret";
import { looksLikeTxId, looksLikeSparkAddress, looksLikeTokenId } from "@/lib/validate";
import { verifyTxInvolves, inspectTxBasic, addressHasTxBefore } from "@/lib/verifier";
import { rateLimit } from "@/lib/rate-limit";
import { mintThenTransfer } from "@/lib/mint-flow";
import { claimTxOnce } from "@/lib/tx-once";
import { reserveFcfsSlot, rollbackFcfsSlot, peekFcfsCount, checkFcfsUsed } from "@/lib/fcfs-store";
import { reservePaidSlot, rollbackPaidSlot, peekPaidCount } from "@/lib/paid-store";
import { reserveOgClaim, rollbackOgClaim } from "@/lib/og-store";

const SPARK_MAINNET_PREFIX = /^sp1[0-9a-z]{20,}$/i;

function parseCohortSizes(): number[] {
  const csv = String(process.env.PAYMINT_COHORT_SIZES ?? "").trim();
  if (csv) {
    const arr = csv.split(",").map(s => Math.floor(Number(s.trim()))).filter(n => Number.isFinite(n) && n > 0);
    if (arr.length > 0) return arr;
  }
  const count = Number(process.env.PAYMINT_COHORT_COUNT ?? '10');
  const size  = Number(process.env.PAYMINT_COHORT_SIZE ?? '1000');
  const c = Number.isFinite(count) && count > 0 ? Math.floor(count) : 10;
  const s = Number.isFinite(size) && size > 0 ? Math.floor(size) : 1000;
  return Array.from({ length: c }, () => s);
}
function cohortPrice(i: number): bigint {
  const base = BigInt(String(process.env.PAYMINT_COHORT_BASE_SATS ?? '220'));
  const step = BigInt(String(process.env.PAYMINT_COHORT_STEP_SATS ?? '220'));
  const k = BigInt(Math.max(1, i));
  return base + step * (k - 1n);
}
function nextCohortFromCount(soldCount: number, sizes: number[]): { index: number; slot: number | null; priceSats: bigint } | null {
  let rem = soldCount;
  for (let i = 0; i < sizes.length; i++) {
    const cap = sizes[i];
    if (rem < cap) {
      const idx1 = i + 1;
      const slot = rem + 1;
      return { index: idx1, slot, priceSats: cohortPrice(idx1) };
    }
    rem -= cap;
  }
  return null;
}
function ipKey(req: NextRequest, scope: string){
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  return `${scope}:${ip}`;
}
function envInt(name: string, def: number){
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : def;
}
function envBool(name:string, def=false){
  const s = String(process.env[name] ?? '').trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes') return true;
  if (s === '0' || s === 'false' || s === 'no') return false;
  return def;
}
function ensureServerMainnet() {
  const net = String(process.env.SPARK_NETWORK || '').toUpperCase();
  if (net && net !== 'MAINNET') throw new Error('Server must run with SPARK_NETWORK=MAINNET for this endpoint');
}
function pow10(n: bigint) { let r = 1n; for (let i = 0n; i < n; i++) r *= 10n; return r; }
function pickUnits(envUnits: string | undefined, envTokens: string | undefined, envDecimals: string | undefined): bigint | null {
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
  const RL_LIMIT     = envInt('PAYMINT_VERIFY_RL_LIMIT', 1);
  const RL_WINDOW_MS = envInt('PAYMINT_VERIFY_RL_WINDOW_MS', 60_000);
  const rl = rateLimit(ipKey(req,'paymint:verify'), RL_LIMIT, RL_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json({ ok:false, error:'rate_limited', retryAfterMs: rl.retryAfterMs ?? RL_WINDOW_MS }, { status: 429 });
  }
  const MIN_AGE_MS = envInt('PAYMINT_MIN_VERIFY_DELAY_MS', 0);
  const MAP_PENDING_TO_TOO_EARLY = envBool('PAYMINT_MAP_PENDING_TO_TOO_EARLY', false);

  try {
    ensureServerMainnet();

    const body = await req.json().catch(()=> ({}));
    const token = String(body?.token || '').trim();
    const payerHint = String(body?.payerSparkAddress || '').trim() || undefined;
    const txId  = body?.txId ? String(body.txId).trim() : undefined;

    if (!token) return NextResponse.json({ ok:false, error:'missing token' }, { status:400 });
    if (!txId)  return NextResponse.json({ ok:false, error:'tx_required' }, { status:400 });
    if (!looksLikeTxId(txId)) return NextResponse.json({ ok:false, error:'bad txId format' }, { status:400 });

    const hasMnemonic = (process.env.ISSUER_MNEMONIC ?? '').trim().length > 0;
    const hasSeedHex  = (process.env.ISSUER_SEED_HEX ?? '').trim().length > 0;
    if (!hasMnemonic && !hasSeedHex) return NextResponse.json({ ok:false, error:'issuer_secret_missing' }, { status: 500 });

    const secret = getSigningSecretSync();
    const payload = readOrderToken(token, secret) as any;

    const feeAddress = String(payload.feeAddress || '').trim();
    if (!looksLikeSparkAddress(feeAddress) || !SPARK_MAINNET_PREFIX.test(feeAddress))
      return NextResponse.json({ ok:false, error:'bad_payload_feeAddress_not_mainnet' }, { status:400 });

    const age = Date.now() - Number(payload.since || 0);
    if (age < MIN_AGE_MS) return NextResponse.json({ ok:false, error:'too_early', retryAfterMs: Math.max(0, MIN_AGE_MS - age) }, { status: 425 });

    const vres = await verifyTxInvolves(txId, feeAddress, { payer: payerHint });
    const sizes = parseCohortSizes();

    if (!vres.ok) {
      const ogEnabled = envBool('PAYMINT_OG_ENABLED', false);
      if (!ogEnabled) {
        const reason = String(vres.reason || "");
        if (MAP_PENDING_TO_TOO_EARLY && /bad_status\((sent|pending|processing)\)/i.test(reason)) {
          const retryMs = envInt('PAYMINT_PENDING_RETRY_MS', 60_000);
          return NextResponse.json({ ok:false, error:'too_early', source: vres.source || null, retryAfterMs: retryMs }, { status: 425 });
        }
        return NextResponse.json({ ok:false, error: reason || 'verify_failed', source: vres.source || null }, { status: 400 });
      }

      const basic = await inspectTxBasic(txId);
      if (!basic.ok) {
        return NextResponse.json({ ok:false, error:'og_tx_invalid' }, { status: 400 });
      }

      const cutoff = ogCutoffMs();

      if (basic.timestampMs && basic.timestampMs < cutoff) {
        const fromAddr = (basic.fromAddress && SPARK_MAINNET_PREFIX.test(basic.fromAddress)) ? basic.fromAddress
                       : (payerHint && SPARK_MAINNET_PREFIX.test(payerHint) ? payerHint : null);
        if (!fromAddr) {
          return NextResponse.json({ ok:false, error:'og_tx_invalid_no_from' }, { status: 400 });
        }

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

        const claim = claimTxOnce(txId, { receiver: fromAddr, feeAddress: 'any', amount: String(basic.amountSats ?? 0n) });
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

      const fromAddr2 = (basic.fromAddress && SPARK_MAINNET_PREFIX.test(basic.fromAddress)) ? basic.fromAddress
                      : (payerHint && SPARK_MAINNET_PREFIX.test(payerHint) ? payerHint : null);
      if (!fromAddr2) {
        return NextResponse.json({ ok:false, error:'og_tx_invalid', cutoffMs: cutoff, addr: basic.fromAddress || null, txTimeMs: basic.timestampMs ?? null }, { status: 400 });
      }

      const eligible = await addressHasTxBefore(fromAddr2, cutoff);
      if (!eligible) {
        return NextResponse.json({ ok:false, error:'og_not_eligible', cutoffMs: cutoff, addr: fromAddr2, txTimeMs: basic.timestampMs ?? null }, { status: 400 });
      }

      const lock = await reserveOgClaim(fromAddr2);
      if (!lock.ok) {
        return NextResponse.json({ ok:false, tier:'OG', error: lock.reason, cutoffMs: cutoff, addr: fromAddr2 }, { status: 400 });
      }

      const tokenId = process.env.PAYMINT_PAYOUT_TOKEN_ID || null;
      if (!tokenId || !looksLikeTokenId(tokenId)) {
        await rollbackOgClaim(fromAddr2);
        return NextResponse.json({ ok:true, minted:false, tier:'OG', reason:'tokenId_missing_or_bad', cutoffMs: cutoff, addr: fromAddr2, txTimeMs: basic.timestampMs ?? null }, { status: 200 });
      }

      const ogUnits = pickUnits(
        process.env.PAYMINT_OG_PAYOUT_BASEUNITS,
        process.env.PAYMINT_OG_TOKENS,
        process.env.PAYMINT_TOKEN_DECIMALS
      );
      if (!ogUnits) {
        await rollbackOgClaim(fromAddr2);
        return NextResponse.json({ ok:true, minted:false, tier:'OG', reason:'payout_baseunits_missing', cutoffMs: cutoff, addr: fromAddr2, txTimeMs: basic.timestampMs ?? null }, { status: 200 });
      }

      const claim2 = claimTxOnce(txId, { receiver: fromAddr2, feeAddress: 'any', amount: String(basic.amountSats ?? 0n) });
      if (!claim2.ok) {
        await rollbackOgClaim(fromAddr2);
        return NextResponse.json({ ok:false, error:'tx_already_used' }, { status: 409 });
      }

      try {
        const out = await mintThenTransfer({ tokenIdentifier: tokenId, tokenAmount: ogUnits, receiverSparkAddress: fromAddr2 });
        return NextResponse.json({
          ok:true, minted:true, tier:'OG',
          mintReceiver: fromAddr2,
          cutoffMs: cutoff,
          txTimeMs: basic.timestampMs ?? null,
          payoutBaseUnits: ogUnits.toString(),
          mintTxId: out.mintTxId, transferTxId: out.transferTxId
        });
      } catch (e:any) {
        await rollbackOgClaim(fromAddr2);
        return NextResponse.json({ ok:true, minted:false, tier:'OG', mintReceiver: fromAddr2, errorMint:String(e?.message||e), cutoffMs: cutoff, txTimeMs: basic.timestampMs ?? null }, { status: 200 });
      }
    }

    const fromAddr = vres.fromAddress && SPARK_MAINNET_PREFIX.test(vres.fromAddress) ? vres.fromAddress : (payerHint && SPARK_MAINNET_PREFIX.test(payerHint) ? payerHint : null);
    if (!fromAddr) return NextResponse.json({ ok:false, error:'cannot_detect_payer_address' }, { status: 400 });
    const paidAmount = vres.amountSats ?? 0n;

    const claim = claimTxOnce(txId, { receiver: fromAddr, feeAddress, amount: String(paidAmount) });
    if (!claim.ok) return NextResponse.json({ ok:false, error:'tx_already_used' }, { status: 409 });

    const tokenId = process.env.PAYMINT_PAYOUT_TOKEN_ID || null;
    if (!tokenId || !looksLikeTokenId(tokenId)) {
      claim.release();
      return NextResponse.json({ ok:true, minted:false, reason:'tokenId_missing_or_bad' }, { status: 200 });
    }

    const fcfsPrice = BigInt(String(process.env.PAYMINT_FCFS_PRICE_SATS ?? '1'));
    const fcfsPeek = await peekFcfsCount();
    const fcfsUsed = await checkFcfsUsed(fromAddr).then(r => !!r.used).catch(() => false);

    if (!fcfsPeek.soldOut && !fcfsUsed && paidAmount >= fcfsPrice) {
      const resv = await reserveFcfsSlot(fromAddr, Number(process.env.PAYMINT_COHORT_FCFS_FREE ?? '1000'));
      if (!resv.ok) {
        const paidPeek = await peekPaidCount().catch(()=>({count:0}));
        const next = nextCohortFromCount(paidPeek.count || 0, sizes);
        claim.release();
        return NextResponse.json({
          ok:false,
          error: resv.reason,
          tier: 'FCFS',
          message: resv.reason === 'fcfs_address_used'
            ? 'You already claimed Free Mint. You can mint again on Paid Mint.'
            : (resv.reason === 'fcfs_sold_out' ? 'Free Mint is sold out.' : 'Free Mint not available.'),
          nextPaid: next ? {
            cohortIndex: next.index,
            nextSlot: next.slot,
            requiredAmountSats: next.priceSats.toString()
          } : null
        }, { status: resv.reason === 'fcfs_sold_out' ? 409 : 400 });
      } else {
        const fcfsUnits = pickUnits(
          process.env.PAYMINT_FCFS_PAYOUT_BASEUNITS,
          process.env.PAYMINT_FCFS_TOKENS,
          process.env.PAYMINT_TOKEN_DECIMALS
        );
        if (!fcfsUnits) {
          await rollbackFcfsSlot(fromAddr);
          claim.release();
          return NextResponse.json({ ok:true, minted:false, tier:'FCFS', mintReceiver: fromAddr, reason:'payout_baseunits_missing' }, { status: 200 });
        }
        try {
          const out = await mintThenTransfer({ tokenIdentifier: tokenId, tokenAmount: fcfsUnits, receiverSparkAddress: fromAddr });
          return NextResponse.json({
            ok:true, minted:true, tier:'FCFS',
            mintReceiver: fromAddr,
            payoutBaseUnits: fcfsUnits.toString(),
            mintTxId: out.mintTxId, transferTxId: out.transferTxId
          });
        } catch (e:any) {
          await rollbackFcfsSlot(fromAddr);
          claim.release();
          return NextResponse.json({ ok:true, minted:false, tier:'FCFS', mintReceiver: fromAddr, errorMint:String(e?.message||e) }, { status: 200 });
        }
      }
    }

    const paidRes = await reservePaidSlot(sizes);
    if (!paidRes.ok) {
      claim.release();
      return NextResponse.json({ ok:false, error: paidRes.reason }, { status: 409 });
    }
    const priceIndex = Math.max(1, paidRes.cohortIndex);
    const expectedPaid = cohortPrice(priceIndex);

    if (paidAmount !== expectedPaid) {
      await rollbackPaidSlot();
      claim.release();
      return NextResponse.json({
        ok:false,
        error:`paid_amount_wrong(expected=${expectedPaid} got=${paidAmount})`,
        cohortIndex: priceIndex,
        requiredAmountSats: expectedPaid.toString(),
        message: 'Amount does not match current cohort price.'
      }, { status: 400 });
    }

    const paidUnits = pickUnits(
      process.env.PAYMINT_PAID_PAYOUT_BASEUNITS,
      process.env.PAYMINT_PAID_TOKENS,
      process.env.PAYMINT_TOKEN_DECIMALS
    );
    if (!paidUnits) {
      await rollbackPaidSlot();
      claim.release();
      return NextResponse.json({ ok:true, minted:false, reason:'payout_baseunits_missing' }, { status: 200 });
    }

    try {
      const out = await mintThenTransfer({ tokenIdentifier: tokenId, tokenAmount: paidUnits, receiverSparkAddress: fromAddr });
      const peek2 = await peekPaidCount();
      return NextResponse.json({
        ok:true, minted:true, tier:'PAID',
        mintReceiver: fromAddr,
        cohort: { index: priceIndex, slot: paidRes.slotIndex, priceSats: expectedPaid.toString(), paidCountTotal: peek2.count },
        payoutBaseUnits: paidUnits.toString(),
        mintTxId: out.mintTxId, transferTxId: out.transferTxId
      });
    } catch (e:any) {
      await rollbackPaidSlot();
      claim.release();
      return NextResponse.json({ ok:true, minted:false, tier:'PAID', mintReceiver: fromAddr, errorMint:String(e?.message||e) }, { status: 200 });
    }
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e?.message || e) }, { status: 500 });
  }
}
