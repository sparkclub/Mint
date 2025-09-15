import { NextResponse } from "next/server";
import { z } from "zod";
import { getTxJson, extractBtknFromJson, findBtknOnAddress } from "@/lib/sparkscan";
import { upsertEnvFile } from "@/lib/upsert-env";

function auth(req: Request) {
  const want = process.env.ADMIN_SECRET || "";
  const got  = req.headers.get("x-admin-key") || "";
  return want && got && want === got;
}

const Body = z.object({
  issuerAddress: z.string().regex(/^sp1[0-9a-z]{20,}$/i, "invalid spark address"),
  ticker: z.string().min(1).max(16).optional(),
  txIds: z.array(z.string().min(16)).optional(),
  decimals: z.coerce.number().int().min(0).max(18).default(6),
  persist: z.coerce.boolean().default(true)
});

export async function POST(req: Request){
  if (!auth(req)) return NextResponse.json({ ok:false, error:"unauthorized" }, { status:401 });
  try {
    const b = Body.parse(await req.json());
    let via: "tx"|"address"|"env"|"none" = "none";
    let tokenIdentifier: string | null = null;

    if (b.txIds?.length){
      for (const tx of b.txIds){
        const j = await getTxJson(tx).catch(()=>null);
        const id = extractBtknFromJson(j);
        if (id){ tokenIdentifier = id; via = "tx"; break; }
      }
    }

    if (!tokenIdentifier){
      const got = await findBtknOnAddress(b.issuerAddress, process.env.SPARK_NETWORK?.toUpperCase(), b.ticker);
      tokenIdentifier = got.tokenIdentifier;
      if (tokenIdentifier) via = "address";
      else return NextResponse.json({ ok:false, error:"not_found", via, candidates: got.candidates, url: got.url }, { status:404 });
    }

    process.env.PAYMINT_TOKEN_IDENTIFIER = tokenIdentifier!;
    process.env.PAYMINT_TOKEN_DECIMALS   = String(b.decimals);

    let savedTo: string | null = null;
    if (b.persist){
      savedTo = await upsertEnvFile({
        PAYMINT_TOKEN_IDENTIFIER: tokenIdentifier!,
        PAYMINT_TOKEN_DECIMALS: String(b.decimals)
      });
    }

    return NextResponse.json({ ok:true, tokenIdentifier, decimals: b.decimals, via, savedTo });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.errors || e?.message || String(e) }, { status:400 });
  }
}
