export function looksLikeSparkAddress(addr: string): boolean {
  return /^sp1[0-9a-z]{20,}$/i.test((addr || "").trim());
}
export function looksLikeTokenId(id: string): boolean {
  return /^btkn1[0-9a-z]{10,}$/i.test((id || "").trim());
}
export function looksLikeTxId(s: string): boolean {
  const t = (s || "").trim();
  const hex32 = /^[0-9a-f]{32}$/i;
  const hex64 = /^[0-9a-f]{64}$/i;
  const dashed = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  return hex32.test(t) || hex64.test(t) || dashed.test(t);
}
export function parseAmountToBigInt(x: string | number | bigint): bigint {
  if (typeof x === "bigint") return x;
  if (typeof x === "number") {
    if (!Number.isFinite(x) || !Number.isInteger(x)) throw new Error("amount must be integer");
    return BigInt(x);
  }
  if (!/^[0-9]+$/.test(x)) throw new Error("amount must be integer (base units)");
  return BigInt(x);
}
