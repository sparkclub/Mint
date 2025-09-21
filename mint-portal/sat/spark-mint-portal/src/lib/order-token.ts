// src/lib/order-token.ts
import crypto from "node:crypto";

export type OrderPayload = {
  feeAddress: string;          
  amount: string;             
  since: number;
  receiver: string;           
  tokenId?: string | null;
  payoutBase?: string | null;
  tier?: 'OG' | 'STANDARD';   
};

export function makeOrderToken(data: OrderPayload, secret: string): string {
  const enc = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(enc).digest("base64url");
  return `${enc}.${sig}`;
}

export function readOrderToken(token: string, secret: string): OrderPayload {
  const [enc, sig] = (token || "").split(".");
  if (!enc || !sig) throw new Error("bad token");
  const expect = crypto.createHmac("sha256", secret).update(enc).digest("base64url");
  if (sig !== expect) throw new Error("bad signature");
  return JSON.parse(Buffer.from(enc, "base64url").toString("utf8")) as OrderPayload;
}
