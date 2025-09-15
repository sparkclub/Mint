import { NextResponse } from "next/server";
import { cfg } from "@/lib/config";

function newFee(address: string, base: bigint) {
  const id = Math.random().toString(36).slice(2);
  const suffix = BigInt(1 + Math.floor(Math.random() * 97)); 
  return { id, address, amount: base + suffix, since: Date.now() };
}

export async function POST() {
  try {
    if (!cfg.feeAddress || cfg.feeAmount <= 0n) {
      return NextResponse.json({ ok:false, error:"fee not configured" }, { status:400 });
    }
    const rec = newFee(cfg.feeAddress, cfg.feeAmount);
    return NextResponse.json({
      ok: true,
      id: rec.id,
      address: rec.address,
      amount: rec.amount.toString(),   
      since: rec.since
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status:400 });
  }
}
