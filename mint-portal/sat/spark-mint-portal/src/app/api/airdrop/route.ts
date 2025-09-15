import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getIssuerWallet } from '@/lib/spark';
import { looksLikeSparkAddress, parseAmountToBigInt } from '@/lib/validate';

const Body = z.object({
  tokenIdentifier: z.string(),     
  toSparkAddress: z.string(),       
  amount: z.string(),              
});

export async function POST(req: Request) {
  try {
    const b = Body.parse(await req.json());

    if (!looksLikeSparkAddress(b.toSparkAddress)) {
      throw new Error('invalid spark address');
    }

    const wallet = await getIssuerWallet();
    const amount = parseAmountToBigInt(b.amount);

    const txId = await (wallet as any).transferTokens({
      tokenIdentifier: b.tokenIdentifier as any,
      tokenAmount: amount,
      receiverSparkAddress: b.toSparkAddress,
    });

    return NextResponse.json({ ok: true, txId: String(txId) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 400 });
  }
}
