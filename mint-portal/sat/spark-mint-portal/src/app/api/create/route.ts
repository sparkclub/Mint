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
    const body = await req.json().catch(() => ({}));
    const {
      tokenName = 'spark brc',
      tokenTicker = 'SBRC',
      decimals = 6,
      maxSupplyTokens = '2100000000', 
      isFreezable = true
    } = body || {};

    const w = await getIssuerWallet();

    try {
      const meta = await w.getIssuerTokenMetadata();
      return NextResponse.json({ ok:true, alreadyCreated:true, txId: null, meta });
    } catch {}

    const maxSupplyBase = toBaseUnits(String(maxSupplyTokens), Number(decimals));

    const txId: string = await w.createToken({
      tokenName,
      tokenTicker,
      decimals: Number(decimals),
      maxSupply: maxSupplyBase,
      isFreezable: Boolean(isFreezable)
    });

    const meta = await w.getIssuerTokenMetadata();
    return NextResponse.json({ ok:true, alreadyCreated:false, txId, meta });
  } catch (e: any) {
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status:500 });
  }
}
