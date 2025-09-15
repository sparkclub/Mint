import { NextResponse } from "next/server";

function checkAdmin(req: Request) {
  const want = process.env.ADMIN_SECRET || "";
  const got = req.headers.get("x-admin-key") || "";
  return want && got && want === got;
}
function hyphenate32(hex: string){
  const h = (hex||"").trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(h)) return null;
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
async function tryFetch(id:string){
  const net = (process.env.SPARK_NETWORK || "MAINNET").toUpperCase();
  const url = `https://api.sparkscan.io/v1/tx/${encodeURIComponent(id)}?network=${encodeURIComponent(net)}`;
  const r = await fetch(url, { headers: { "accept":"application/json" }});
  if (!r.ok) throw new Error(`sparkscan ${r.status}`);
  return r.json();
}

export async function GET(req: Request){
  if (!checkAdmin(req)) return NextResponse.json({ ok:false, error:"unauthorized" }, { status: 401 });
  try{
    const u = new URL(req.url);
    const txId = (u.searchParams.get("txId") || "").trim();
    if(!txId) return NextResponse.json({ ok:false, error:"missing txId" }, { status: 400 });


    try {
      const data = await tryFetch(txId);
      return NextResponse.json({ ok:true, mode:"direct", data });
    } catch(e:any){ /* continue */ }


    const uuid = hyphenate32(txId.replace(/-/g,""));
    if (uuid) {
      try {
        const data = await tryFetch(uuid);
        return NextResponse.json({ ok:true, mode:"uuid", id: uuid, data });
      } catch(e:any){ /* continue */ }
    }

    return NextResponse.json({ ok:false, error:"not_found_or_wrong_format" }, { status: 404 });
  }catch(e:any){
    return NextResponse.json({ ok:false, error: String(e?.message||e) }, { status: 500 });
  }
}
