import crypto from "node:crypto";

export type OrderPayload = {
  feeAddress: string;   
  amount: string;      
  since: number;       
  receiver: string;    
};

export function makeOrderToken(data: OrderPayload, secret: string): string {
  const enc = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(enc).digest("base64url");
  return `${enc}.${sig}`;
}

/** Validasi & decode token order */
export function readOrderToken(token: string, secret: string): OrderPayload {
  const [enc, sig] = (token || "").split(".");
  if (!enc || !sig) throw new Error("bad token");
  const expect = crypto.createHmac("sha256", secret).update(enc).digest("base64url");
  if (sig !== expect) throw new Error("bad signature");
  const obj = JSON.parse(Buffer.from(enc, "base64url").toString("utf8"));
  return obj as OrderPayload;
}
