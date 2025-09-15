import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getIssuerWallet } from '@/lib/spark';
import { rateLimit } from '@/lib/rateLimit';

const Body = z.object({
  name: z.string().min(2).max(64),
  ticker: z.string().min(1).max(10),
  decimals: z.coerce.number().int().min(0).max(18),
  maxSupply: z.string().regex(/^[0-9]+$/),
  freezable: z.coerce.boolean().default(true),
});

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  const gate = rateLimit('create:'+ip, 5, 30_000);
  if (!gate.ok) return NextResponse.json({ ok:false, error:'rate_limited' }, { status:429 });

  try {
    const b = Body.parse(await req.json());
    const wallet = await getIssuerWallet();
    const maxSupplyBig = BigInt(b.maxSupply);

    const txId = await wallet.createToken({
      tokenName: b.name,
      tokenTicker: b.ticker,
      decimals: b.decimals,
      maxSupply: maxSupplyBig,
      isFreezable: b.freezable,
    });

    return NextResponse.json({ ok:true, txId });
  } catch (e: any) {
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status:400 });
  }
}
