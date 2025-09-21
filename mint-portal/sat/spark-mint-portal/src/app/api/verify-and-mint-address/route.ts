import { NextResponse } from "next/server";
import { z } from "zod";
import { getIssuerWallet } from "@/lib/spark";
import { looksLikeSparkAddress, looksLikeTokenId, parseAmountToBigInt } from "@/lib/validate";
import { verifyIncomingByAddress } from "@/lib/verifyByAddress";

const Body = z.object({
  feeAddress: z.string(),
  feeAmount: z.string(),
  since: z.number().int(),
  tokenIdentifier: (z.string as any)(),
  receiverSparkAddress: z.string(),
  tokenAmount: z.string(),
});

export async function POST(req: Request) {
  try {
    const { feeAddress, feeAmount, since, tokenIdentifier, receiverSparkAddress, tokenAmount } = Body.parse(await req.json());
    if (!looksLikeTokenId(tokenIdentifier)) throw new Error("invalid btkn id");
    if (!looksLikeSparkAddress(receiverSparkAddress)) throw new Error("invalid spark address");

    const paid = await verifyIncomingByAddress(feeAddress, BigInt(feeAmount));
    if (!paid) throw new Error("fee not found yet");

    const wallet = await getIssuerWallet();
    const txId = await wallet.transferTokens({
      tokenIdentifier,
      tokenAmount: parseAmountToBigInt(tokenAmount),
      receiverSparkAddress,
    });

    return NextResponse.json({ ok:true, txId, to: receiverSparkAddress });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status:400 });
  }
}
