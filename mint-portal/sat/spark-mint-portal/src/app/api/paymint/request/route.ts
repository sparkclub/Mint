export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { looksLikeSparkAddress, looksLikeTokenId } from "@/lib/validate";
import { makeOrderToken, OrderPayload } from "@/lib/order-token";
import { getSigningSecretSync } from "@/lib/signing-secret";
import { rateLimit } from "@/lib/rate-limit";
import { peekFcfsCount, checkFcfsUsed } from "@/lib/fcfs-store";
import { peekPaidCount } from "@/lib/paid-store";

function ipKey(req: NextRequest, scope: string){
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  return `${scope}:${ip}`;
}

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

export async function POST(req: NextRequest) {
  const rl = rateLimit(ipKey(req,'paymint:request'), 20, 10_000);
  if (!rl.ok) return NextResponse.json({ ok:false, error:'rate_limited', retryAfterMs: rl.retryAfterMs }, { status: 429 });

  try {
    const body = await req.json().catch(()=> ({}));
    const receiverSparkAddress = String(body?.receiverSparkAddress || '').trim();
    if (!looksLikeSparkAddress(receiverSparkAddress)) {
      return NextResponse.json({ ok:false, error:'bad_receiver' }, { status: 400 });
    }

    const feeAddress = String(process.env.PAYMINT_FEE_ADDRESS || '').trim();
    if (!looksLikeSparkAddress(feeAddress)) {
      return NextResponse.json({ ok:false, error:'merchant_feeAddress_not_set' }, { status: 500 });
    }

    const tokenIdEnv = process.env.PAYMINT_PAYOUT_TOKEN_ID || null;
    const tokenId = tokenIdEnv && looksLikeTokenId(tokenIdEnv) ? tokenIdEnv : null;

    const fcfsLimit = Number(process.env.PAYMINT_COHORT_FCFS_FREE ?? '1000');
    const fcfsPrice = BigInt(String(process.env.PAYMINT_FCFS_PRICE_SATS ?? '1'));
    const fcfsPeek = await peekFcfsCount().catch(()=>({ count: 0, soldOut: false, limit: fcfsLimit }));
    const fcfsUsed = await checkFcfsUsed(receiverSparkAddress).then(r=>!!r.used).catch(()=>false);
    const fcfsAvailable = (fcfsPeek.count ?? 0) < fcfsLimit;

    const sizes = parseCohortSizes();
    const paidPeek = await peekPaidCount().catch(()=>({ count: 0 }));
    let paidAcc = 0;
    let paidCohortIndex: number | null = null;
    for (let i=0;i<sizes.length;i++){
      const cap = paidAcc + sizes[i];
      if ((paidPeek.count ?? 0) < cap) { paidCohortIndex = i+1; break; }
      paidAcc = cap;
    }
    const paidTotalCohorts = sizes.length;

    let suggestedTier: 'FCFS' | 'PAID' = 'PAID';
    let requiredAmountSats = '0';
    let tierLabel = 'Paid Sold Out';
    let lastRound = false;

    if (fcfsAvailable && !fcfsUsed) {
      suggestedTier = 'FCFS';
      requiredAmountSats = fcfsPrice.toString();
      tierLabel = fcfsPrice === 0n ? 'FCFS Tier Free' : 'FCFS Tier Free';
    } else {
      if (paidCohortIndex) {
        const price = cohortPrice(paidCohortIndex);
        suggestedTier = 'PAID';
        requiredAmountSats = price.toString();
        tierLabel = `Paid Mint — Tier ${paidCohortIndex}`;
        lastRound = paidCohortIndex === paidTotalCohorts;
      }
    }

    const since = Date.now();
    const payload: OrderPayload = {
      feeAddress,
      amount: requiredAmountSats,
      since,
      receiver: receiverSparkAddress,
      tokenId,
      payoutBase: null
    };

    const token = makeOrderToken(payload, getSigningSecretSync());

    return NextResponse.json({
      ok: true,
      feeAddress,
      amount: requiredAmountSats,
      since,
      receiver: receiverSparkAddress,
      tokenId,
      payoutBase: null,
      orderToken: token,
      suggestedTier,
      tierLabel,
      requiredAmountSats,
      fcfs: {
        available: fcfsAvailable,
        alreadyClaimed: fcfsUsed,
        priceSats: fcfsPrice.toString(),
        limit: fcfsLimit,
        taken: fcfsPeek.count ?? 0
      },
      paid: {
        cohortIndex: paidCohortIndex,
        totalCohorts: paidTotalCohorts,
        priceSats: paidCohortIndex ? cohortPrice(paidCohortIndex).toString() : null,
        mintedCount: paidPeek.count ?? 0,
        sizes
      },
      lastRound
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e?.message || e) }, { status: 500 });
  }
}
