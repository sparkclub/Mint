import { NextRequest, NextResponse } from 'next/server';
import { getIssuerWallet } from '@/lib/issuer';
import { requireAuth } from '@/lib/auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return NextResponse.json({ ok:false, error:authErr }, { status:401 });

  try {
    const w = await getIssuerWallet();
    const bal = await w.getIssuerTokenBalance();
    return NextResponse.json({
      ok:true,
      balance: bal.balance.toString(),
      tokenIdentifier: bal.bech32mTokenIdentifier
    });
  } catch (e: any) {
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status:500 });
  }
}
