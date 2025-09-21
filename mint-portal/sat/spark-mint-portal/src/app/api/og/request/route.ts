// src/app/api/og/request/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { looksLikeSparkAddress } from "@/lib/validate";
import { makeOrderToken, OrderPayload } from "@/lib/order-token";
import { getSigningSecretSync } from "@/lib/signing-secret";
import { rateLimit } from "@/lib/rate-limit";

function ipKey(req: NextRequest, scope: string){
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  return `${scope}:${ip}`;
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(ipKey(req,'og:request'), 20, 10_000);
  if (!rl.ok) return NextResponse.json({ ok:false, error:'rate_limited', retryAfterMs: rl.retryAfterMs }, { status: 429 });

  try {
    const body = await req.json().catch(()=> ({}));
    const receiver = String(body?.receiverSparkAddress || '').trim();
    if (!looksLikeSparkAddress(receiver)) {
      return NextResponse.json({ ok:false, error:'bad_receiver' }, { status: 400 });
    }

    const since = Date.now();
    const payload: OrderPayload = {
      feeAddress: '',     
      amount: '0',        
      since,
      receiver,
      tokenId: process.env.PAYMINT_PAYOUT_TOKEN_ID || null,
      payoutBase: null,
      tier: 'OG',         
    };

    const token = makeOrderToken(payload, getSigningSecretSync());

    return NextResponse.json({
      ok: true,
      orderToken: token,
      tier: 'OG',
      since,
      receiver,
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e?.message || e) }, { status: 500 });
  }
}
