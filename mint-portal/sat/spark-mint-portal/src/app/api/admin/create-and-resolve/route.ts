import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertEnvFile } from "@/lib/upsert-env";
import { getTxJson, extractBtknFromJson, findBtknOnAddress } from "@/lib/sparkscan";
import { getIssuerWallet, getIssuerAddress } from "@/lib/spark";

function authOk(req: Request){
  const want = process.env.ADMIN_SECRET || "";
  const got  = req.headers.get("x-admin-key") || "";
  return want && got && want === got;
}

const Body = z.object({
  name: z.string().min(2).max(64),
  ticker: z.string().min(1).max(16),
  decimals: z.coerce.number().int().min(0).max(18).default(6),
  maxSupply: z.string().regex(/^[0-9]+$/),
  freezable: z.coerce.boolean().default(true),
  persist: z.coerce.boolean().default(true),
  setAsCurrent: z.coerce.boolean().default(true),
});

async function sleep(ms:number){ return new Promise(r=>setTimeout(r,ms)); }

export async function POST(req: Request){
  if (!authOk(req)) return NextResponse.json({ ok:false, error:"unauthorized" }, { status:401 });
  try {
    const b = Body.parse(await req.json());
    const wallet = await getIssuerWallet();

    const txId = await wallet.createToken({
      tokenName: b.name,
      tokenTicker: b.ticker,
      decimals: b.decimals,
      maxSupply: BigInt(b.maxSupply),
      isFreezable: b.freezable
    });

    const issuerAddr = process.env.ISSUER_SPARK_ADDRESS || await getIssuerAddress().catch(()=>null);

    let tokenIdentifier: string | null = null;
    const attempts: any[] = [];
    for (let i=0;i<10 && !tokenIdentifier;i++){
      const j = await getTxJson(txId).catch(e=>({ _err: String(e) }));
      attempts.push({ step:"tx", i, ok: !j?false:!("_err" in j), err: ("_err" in (j||{})) ? j._err : null });
      tokenIdentifier = extractBtknFromJson(j);
      if (tokenIdentifier) break;
      await sleep(1500 + i*500);
    }
    if (!tokenIdentifier && issuerAddr){
      const got = await findBtknOnAddress(issuerAddr, process.env.SPARK_NETWORK?.toUpperCase(), b.ticker);
      attempts.push({ step:"address", candidates: got.candidates, url: got.url });
      tokenIdentifier = got.tokenIdentifier;
    }

    let savedTo: string | null = null;
    if (tokenIdentifier && b.setAsCurrent){
      process.env.PAYMINT_TOKEN_IDENTIFIER = tokenIdentifier;
      process.env.PAYMINT_TOKEN_DECIMALS   = String(b.decimals);
      if (b.persist){
        savedTo = await upsertEnvFile({
          PAYMINT_TOKEN_IDENTIFIER: tokenIdentifier,
          PAYMINT_TOKEN_DECIMALS: String(b.decimals)
        });
      }
    }

    return NextResponse.json({
      ok: true,
      txId,
      issuerAddress: issuerAddr,
      tokenIdentifier: tokenIdentifier || null,
      setAsCurrent: !!(tokenIdentifier && b.setAsCurrent),
      savedTo,
      attempts,
      note: tokenIdentifier ? "resolved" : "resolve_pending_try_again_later"
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status:400 });
  }
}
