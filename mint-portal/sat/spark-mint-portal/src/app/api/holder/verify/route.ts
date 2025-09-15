export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { readOrderToken } from "@/lib/order-token";
import { getSigningSecretSync } from "@/lib/signing-secret";
import { looksLikeSparkAddress, looksLikeTokenId } from "@/lib/validate";
import { mintThenTransfer } from "@/lib/mint-flow";
import { reserveHolderClaim, rollbackHolderClaim, isHolderClaimed } from "@/lib/holder-store";

const SPARK_MAINNET_PREFIX = /^sp1[0-9a-z]{20,}$/i;

function pow10(n: bigint){ let r=1n; for(let i=0n;i<n;i++) r*=10n; return r; }
function pickUnits(envUnits?: string, envTokens?: string, envDecimals?: string): bigint | null {
  try { const n = BigInt(String(envUnits ?? "")); if (n > 0n) return n; } catch {}
  if (/^[0-9]+$/.test(String(envTokens ?? "")) && /^[0-9]+$/.test(String(envDecimals ?? ""))) {
    const t = BigInt(String(envTokens)); const d = BigInt(String(envDecimals));
    return t * pow10(d);
  }
  return null;
}
function ensureMainnet(){
  const net = String(process.env.SPARK_NETWORK || "").toUpperCase();
  if (net && net !== "MAINNET") throw new Error("SPARK_NETWORK must be MAINNET");
}
function envOn(name: string): boolean {
  const s = String(process.env[name] || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

export async function POST(req: NextRequest) {
  try {
    ensureMainnet();

    const body = await req.json().catch(()=> ({}));
    const token = String(body?.token || "").trim();
    if (!token) return NextResponse.json({ ok:false, error:"missing_token" }, { status:400 });

    if (!envOn("PAYMINT_HOLDER_ENABLED")) {
      return NextResponse.json({ ok:false, error:"holder_disabled" }, { status:400 });
    }

    const payload = readOrderToken(token, getSigningSecretSync()) as any;
    const receiver = String(payload?.receiver || "").trim();
    if (!looksLikeSparkAddress(receiver) || !SPARK_MAINNET_PREFIX.test(receiver)) {
      return NextResponse.json({ ok:false, error:"bad_receiver" }, { status:400 });
    }

    if (payload?.tier && String(payload.tier).toUpperCase() !== "HOLDER") {
      return NextResponse.json({ ok:false, error:"wrong_tier" }, { status:400 });
    }

    if (await isHolderClaimed(receiver)) {
      return NextResponse.json({ ok:false, error:"holder_already_claimed" }, { status:409 });
    }

    const tokenId = (process.env.PAYMINT_HOLDER_PAYOUT_TOKEN_ID || process.env.PAYMINT_PAYOUT_TOKEN_ID || "").trim();
    if (!looksLikeTokenId(tokenId)) {
      return NextResponse.json({ ok:true, minted:false, reason:"tokenId_missing_or_bad" }, { status:200 });
    }

    const baseUnits = pickUnits(
      process.env.PAYMINT_HOLDER_PAYOUT_BASEUNITS,
      process.env.PAYMINT_HOLDER_TOKENS,
      process.env.PAYMINT_TOKEN_DECIMALS
    );
    if (!baseUnits) {
      return NextResponse.json({ ok:true, minted:false, reason:"payout_baseunits_missing" }, { status:200 });
    }

    const lock = await reserveHolderClaim(receiver);
    if (!lock.ok) {
      return NextResponse.json({ ok:false, error: lock.reason || "holder_claim_lock_failed" }, { status:409 });
    }

    try {
      const out = await mintThenTransfer({
        tokenIdentifier: tokenId,
        tokenAmount: baseUnits,
        receiverSparkAddress: receiver
      });

      return NextResponse.json({
        ok:true,
        minted:true,
        tier:"HOLDER",
        mintReceiver: receiver,
        payoutBaseUnits: baseUnits.toString(),
        mintTxId: out.mintTxId,
        transferTxId: out.transferTxId
      });
    } catch (e:any) {
      await rollbackHolderClaim(receiver);
      return NextResponse.json({
        ok:true,
        minted:false,
        tier:"HOLDER",
        mintReceiver: receiver,
        errorMint: String(e?.message||e)
      }, { status:200 });
    }
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e?.message||e) }, { status:500 });
  }
}
