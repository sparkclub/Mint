import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getIssuerWallet } from '@/lib/spark';
import { looksLikeSparkAddress, looksLikeTokenId, parseAmountToBigInt } from '@/lib/validate';
import { cfg } from '@/lib/config';

const Body = z.object({
  tokenIdentifier: (z.string as any)(),   
  tokenAmount: z.string()       
});

export async function POST(req: Request) {
  try {
    const { tokenIdentifier, tokenAmount } = Body.parse(await req.json());
    if (!looksLikeTokenId(tokenIdentifier)) throw new Error('invalid btkn id');

    const to = cfg.fixedRecipient;
    if (!to) throw new Error('RECIPIENT_SPARK_ADDRESS not set');
    if (!looksLikeSparkAddress(to)) throw new Error('invalid spark address in env');

    const wallet = await getIssuerWallet();
    const txId = await wallet.transferTokens({
      tokenIdentifier,
      tokenAmount: parseAmountToBigInt(tokenAmount),
      receiverSparkAddress: to,
    });

    return NextResponse.json({ ok: true, txId, to });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status: 400 });
  }
}
