import { NextResponse } from "next/server";
import { cfg } from "@/lib/config";

export async function GET() {
  if (!cfg.feeAddress || cfg.feeAmount <= 0n) {
    return NextResponse.json({ ok: true, feeRequired: false, verifyStrict: cfg.verifyStrict });
  }
  return NextResponse.json({
    ok: true,
    feeRequired: true,
    address: cfg.feeAddress,
    amount: cfg.feeAmount.toString(),
    tokenIdentifier: cfg.feeTokenId || null,
    verifyStrict: cfg.verifyStrict
  });
}
