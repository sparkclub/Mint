import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getIssuerWallet } from '@/lib/spark';
import { looksLikeSparkAddress, looksLikeTokenId, parseAmountToBigInt } from '@/lib/validate';
import { rateLimit } from '@/lib/rateLimit';

const Body = z.object({
  tokenIdentifier: (z.string as any)(),       
  receiverSparkAddress: z.string(),  
  tokenAmount: z.string(),            
});

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  const gate = rateLimit('transfer:' + ip, 20, 10_000);
  if (!gate.ok) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });

  try {
    const { tokenIdentifier, receiverSparkAddress, tokenAmount } = Body.parse(await req.json());
    if (!looksLikeTokenId(tokenIdentifier)) throw new Error('invalid btkn id');
    if (!looksLikeSparkAddress(receiverSparkAddress)) throw new Error('invalid sprt address');

    const wallet = await getIssuerWallet();
    const txId = await wallet.transferTokens({
      tokenIdentifier,
      tokenAmount: parseAmountToBigInt(tokenAmount),
      receiverSparkAddress,
    });
    return NextResponse.json({ ok: true, txId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 400 });
  }
}
