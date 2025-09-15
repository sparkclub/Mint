import { NextRequest, NextResponse } from 'next/server';
import { getIssuerWallet } from '@/lib/issuer';
import { toBaseUnits } from '@/lib/amount';
import { requireAuth } from '@/lib/auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return NextResponse.json({ ok:false, error:authErr }, { status:401 });

  try {
    const { amountTokens } = await req.json();
    if (amountTokens == null) {
      return NextResponse.json({ ok:false, error:'amountTokens required' }, { status:400 });
    }

    const w = await getIssuerWallet();
    const meta = await w.getIssuerTokenMetadata(); 
    const decimals = Number(meta.tokenDecimals);
    const amountBase = toBaseUnits(String(amountTokens), decimals);

    const txId: string = await w.mintTokens(amountBase);
    const bal = await w.getIssuerTokenBalance();

    return NextResponse.json({
      ok: true,
      txId,
      balance: bal.balance.toString(),
      tokenIdentifier: bal.bech32mTokenIdentifier
    });
  } catch (e: any) {
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status:500 });
  }
}
