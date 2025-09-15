import { NextResponse } from "next/server";
import { z } from "zod";
import { getIssuerWallet } from "@/lib/spark";
import { upsertEnv } from "@/lib/envFile";

const Body = z.object({
  name: z.string().min(2).max(64),
  ticker: z.string().regex(/^[A-Za-z0-9]{1,10}$/),
  decimals: z.coerce.number().int().min(0).max(18),
  maxSupply: z.string().regex(/^[0-9]+$/), 
  freezable: z.coerce.boolean().optional().default(true),
  setAsCurrent: z.coerce.boolean().optional().default(false),
});

function checkAdmin(req: Request) {
  const want = process.env.ADMIN_SECRET || "";
  const got = req.headers.get("x-admin-key") || "";
  return want && got && want === got;
}

export async function POST(req: Request){
  if (!checkAdmin(req)) {
    return NextResponse.json({ ok:false, error:"unauthorized" }, { status: 401 });
  }
  try{
    const b = Body.parse(await req.json());
    const wallet = await getIssuerWallet();

    const maxSupplyBig = BigInt(b.maxSupply); 
    const res: any = await wallet.createToken({
      tokenName: b.name,
      tokenTicker: b.ticker,
      decimals: b.decimals,
      maxSupply: maxSupplyBig,
      isFreezable: b.freezable,
    });

    const txId = typeof res === "string" ? res : (res?.txId || res?.transactionId || "");
    const tokenIdentifier: string | undefined = res?.tokenIdentifier || res?.tokenId;

    let envUpdated = false;
    if (b.setAsCurrent && tokenIdentifier) {
      upsertEnv({
        PAYMINT_TOKEN_IDENTIFIER: tokenIdentifier,
        PAYMINT_TOKEN_DECIMALS: String(b.decimals),
      });
      envUpdated = true;
    }

    return NextResponse.json({
      ok: true,
      txId,
      tokenIdentifier: tokenIdentifier || null,
      note: envUpdated
        ? "Token baru diset ke .env. Restart server agar aktif."
        : "Jika tokenIdentifier belum muncul, ambil btkn1… dari wallet/explorer, lalu set lewat endpoint /api/admin/use-token.",
    });
  }catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status: 400 });
  }
}
