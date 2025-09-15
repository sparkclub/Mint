export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { getSigningSecretSync } from "@/lib/signing-secret";
import { makeOrderToken } from "@/lib/order-token";
import { addressEligibleTokens } from "@/lib/verifier";
import { isHolderClaimed } from "@/lib/holder-store";
import { looksLikeSparkAddress } from "@/lib/validate";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const receiver = String(body?.receiverSparkAddress || "").trim();

  if (!looksLikeSparkAddress(receiver)) {
    return NextResponse.json({ ok: false, error: "bad_receiver" }, { status: 400 });
  }

  const tokenIdsEnv = String(process.env.PAYMINT_HOLDER_TOKEN_IDS || "");
  const tokenTickersEnv = String(process.env.PAYMINT_HOLDER_TOKEN_TICKERS || "");

  const idList = tokenIdsEnv.split(",").map(s => s.trim()).filter(Boolean);
  const tkList = tokenTickersEnv.split(",").map(s => s.trim()).filter(Boolean);

  const { matchedIds, matchedTickers } = await addressEligibleTokens(receiver, idList, tkList);
  const eligible = matchedIds.length > 0 || matchedTickers.length > 0;

  let claimed = false;
  try { claimed = await isHolderClaimed(receiver); } catch {}

  if (!eligible) {
    return NextResponse.json({
      ok: true,
      receiver,
      eligible: false,
      claimed: false,
      matchedIds,
      matchedTickers,
      tokenIds: matchedIds 
    });
  }

  if (claimed) {
    return NextResponse.json({
      ok: true,
      receiver,
      eligible: true,
      claimed: true,
      matchedIds,
      matchedTickers,
      tokenIds: matchedIds
    });
  }

  const orderToken = makeOrderToken(
    { receiver, since: Date.now(), tier: "HOLDER" } as any,
    getSigningSecretSync()
  );

  return NextResponse.json({
    ok: true,
    receiver,
    eligible: true,
    claimed: false,
    matchedIds,
    matchedTickers,
    tokenIds: matchedIds,
    orderToken
  });
}
