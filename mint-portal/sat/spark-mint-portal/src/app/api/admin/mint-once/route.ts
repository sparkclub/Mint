import { NextResponse } from "next/server";
import { z } from "zod";
import { getIssuerWallet } from "@/lib/spark";
import { looksLikeTokenId } from "@/lib/validate";

const Body = z.object({
  tokenIdentifier: z.string().optional(),    
  amount: z.string().regex(/^[0-9]+$/).optional(), 
  receiver: z.string().optional(),            
});

function authOk(req: Request){
  const want = process.env.ADMIN_SECRET || "";
  const got  = req.headers.get("x-admin-key") || "";
  return want && got && want === got;
}

export async function POST(req: Request){
  if (!authOk(req)) return NextResponse.json({ ok:false, error:"unauthorized" }, { status:401 });
  try{
    const b = Body.parse(await req.json());
    const wallet = await getIssuerWallet();

    const tokenIdentifier = (b.tokenIdentifier || process.env.PAYMINT_TOKEN_IDENTIFIER || "").trim();
    if (!tokenIdentifier || !looksLikeTokenId(tokenIdentifier)) {
      return NextResponse.json({ ok:false, error:"missing_or_invalid_tokenIdentifier" }, { status:400 });
    }

    let receiver = (b.receiver || process.env.ISSUER_SPARK_ADDRESS || "").trim();
    if (!receiver) {
      receiver = await wallet.getSparkAddress?.() || "";
    }
    if (!receiver.startsWith("sp1")) {
      return NextResponse.json({ ok:false, error:"missing_or_invalid_receiver" }, { status:400 });
    }

    const amountStr = b.amount || "1"; 
    const amount = BigInt(amountStr);


    let txId: string | undefined;
    if (typeof (wallet as any).mintToken === "function") {
      txId = await (wallet as any).mintToken({
        tokenIdentifier,
        amount,
        receiverSparkAddress: receiver,
      });
    } else if (typeof (wallet as any).mint === "function") {
      txId = await (wallet as any).mint({
        tokenIdentifier,
        amount,
        receiver: receiver,
      });
    } else {
      throw new Error("wallet.mintToken/mint not available in current SDK");
    }

    return NextResponse.json({ ok:true, txId, tokenIdentifier, receiver, amount: amount.toString() });
  }catch(e:any){
    return NextResponse.json({ ok:false, error:e?.message||String(e) }, { status:400 });
  }
}
