import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getIssuerWallet, newTokenService, createTokenAndBroadcast, mintAndBroadcast, computeTokenIdentifier } from '@/lib/spark';

const Body = z.object({
  name: z.string().min(2).max(64),
  ticker: z.string().min(2).max(10),
  decimals: z.number().int().min(0).max(18),
  maxSupply: z.string().regex(/^[0-9]+$/),
  freezable: z.boolean().optional().default(true),
});

function pow10(n:number){ let x=1n; for(let i=0;i<n;i++) x*=10n; return x; }

export async function POST(req:Request){
  try{
    const b = Body.parse(await req.json());
    const receiver =
      process.env.MINT_RECEIVER_SPARK_ADDRESS ||
      process.env.ISSUER_SPARK_ADDRESS ||
      process.env.RECIPIENT_SPARK_ADDRESS;

    if (!receiver) {
      return NextResponse.json({ ok:false, error:'Missing MINT_RECEIVER_SPARK_ADDRESS/ISSUER_SPARK_ADDRESS di .env' }, { status:400 });
    }

    const wallet = await getIssuerWallet();
    const tts = newTokenService(wallet);

    const created = await createTokenAndBroadcast(tts, {
      tokenName: b.name,
      tokenTicker: b.ticker,
      decimals: b.decimals,
      maxSupply: BigInt(b.maxSupply),
      isFreezable: !!b.freezable,
    });

    if (!created.ok) {
      return NextResponse.json({ ok:false, stage:'create', details: created }, { status:500 });
    }

    const issuerAddr = process.env.ISSUER_SPARK_ADDRESS || '';
    const tokenId = await computeTokenIdentifier(b.ticker, issuerAddr);

    const one = pow10(b.decimals);
    const minted = await mintAndBroadcast(tts, {
      tokenIdentifier: tokenId,
      tokenAmount: one,
      toSparkAddress: receiver,
    });

    return NextResponse.json({
      ok: minted.ok,
      stage: 'create+mint',
      receiver,
      tokenIdentifier: tokenId,
      createTxId: created.txId,
      mintTxId: minted.txId,
      create: created,
      mint: minted,
    });
  }catch(e:any){
    return NextResponse.json({ ok:false, error: String(e?.message||e) }, { status:500 });
  }
}
