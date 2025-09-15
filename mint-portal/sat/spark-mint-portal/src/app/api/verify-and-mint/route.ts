import { NextResponse } from "next/server";
import { z } from "zod";
import { getIssuerWallet } from "@/lib/spark";
import { looksLikeSparkAddress, looksLikeTokenId, parseAmountToBigInt } from "@/lib/validate";
import { verifyFeePaid } from "@/lib/fee";

const Body = z.object({
  tokenIdentifier: (z.string as any)(),        
  receiverSparkAddress: z.string(),   
  tokenAmount: z.string(),           
  feeTxId: z.string().optional(),   
});

export async function POST(req: Request) {
  try {
    const { tokenIdentifier, receiverSparkAddress, tokenAmount, feeTxId } = Body.parse(await req.json());

    if (!looksLikeTokenId(tokenIdentifier)) throw new Error("invalid btkn id");
    if (!looksLikeSparkAddress(receiverSparkAddress)) throw new Error("invalid spark address");

    await verifyFeePaid({ txId: feeTxId });

    const wallet = await getIssuerWallet();
    const txId = await wallet.transferTokens({
      tokenIdentifier,
      tokenAmount: parseAmountToBigInt(tokenAmount),
      receiverSparkAddress,
    });

    return NextResponse.json({ ok: true, txId, to: receiverSparkAddress });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 400 });
  }
}
