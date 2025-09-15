import { NextResponse } from "next/server";

function authOk(req: Request) {
  const want = process.env.ADMIN_SECRET || "";
  const got = req.headers.get("x-admin-key") || "";
  return want && got && want === got;
}

/** Kembalikan alamat Spark issuer dari ENV.
 *  Set salah satu:
 *   - ISSUER_SPARK_ADDRESS (disarankan)
 *   - fallback: PAYMINT_FEE_SPARK_ADDRESS
 */
export async function GET(req: Request) {
  if (!authOk(req)) return NextResponse.json({ ok:false, error:"unauthorized" }, { status:401 });
  const net = (process.env.SPARK_NETWORK || "MAINNET").toUpperCase();
  const address =
    (process.env.ISSUER_SPARK_ADDRESS || process.env.PAYMINT_FEE_SPARK_ADDRESS || "").trim() || null;

  return NextResponse.json({ ok:true, address, network: net });
}
