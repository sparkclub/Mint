import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertEnvFile } from "@/lib/upsert-env";

function authOk(req: Request) {
  const want = process.env.ADMIN_SECRET || "";
  const got = req.headers.get("x-admin-key") || "";
  return want && got && want === got;
}

const Body = z.object({
  tokenIdentifier: z.string().regex(/^btkn1[0-9a-z]{20,}$/i, "invalid btkn"),
  decimals: z.coerce.number().int().min(0).max(18).default(6),
  persist: z.coerce.boolean().default(true)
});

export async function POST(req: Request) {
  if (!authOk(req)) return NextResponse.json({ ok:false, error:"unauthorized" }, { status:401 });
  try {
    const b = Body.parse(await req.json());

    process.env.PAYMINT_TOKEN_IDENTIFIER = b.tokenIdentifier;
    process.env.PAYMINT_TOKEN_DECIMALS   = String(b.decimals);

    let savedTo: string | null = null;
    if (b.persist) {
      savedTo = await upsertEnvFile({
        PAYMINT_TOKEN_IDENTIFIER: b.tokenIdentifier,
        PAYMINT_TOKEN_DECIMALS: String(b.decimals)
      });
    }

    return NextResponse.json({
      ok: true,
      tokenIdentifier: b.tokenIdentifier,
      decimals: b.decimals,
      savedTo
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.errors || e?.message || String(e) }, { status:400 });
  }
}
