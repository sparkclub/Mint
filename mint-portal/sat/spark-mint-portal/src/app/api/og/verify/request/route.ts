export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { getSigningSecretSync } from "@/lib/signing-secret";
import { makeOrderToken } from "@/lib/order-token";

function envBool(name:string, def=false){
  const s = String(process.env[name] ?? '').trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'no'  || s === 'off') return false;
  return def;
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
    if (!envBool('PAYMINT_OG_ENABLED', false)) {
      return NextResponse.json({ ok:false, error:'og_disabled' }, { status: 400 });
    }
    const since = Date.now();
    const payload = { tier: 'OG', since, cutoffMs: ogCutoffMs() } as any;
    const token = makeOrderToken(payload, getSigningSecretSync());
    return NextResponse.json({
      ok: true,
      tier: 'OG',
      since,
      cutoffMs: payload.cutoffMs,
      orderToken: token
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e?.message||e) }, { status: 500 });
  }
}
