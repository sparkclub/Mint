// src/lib/validate.ts
import { bech32, bech32m } from 'bech32';

/** Coba decode sebagai bech32; kalau gagal coba bech32m */
function bech32DecodeAny(addr: string) {
  const a = String(addr || '').trim();
  try {
    const dec = bech32.decode(a);
    return { enc: 'bech32' as const, dec };
  } catch {
    const dec = bech32m.decode(a);
    return { enc: 'bech32m' as const, dec };
  }
}

/** Re-encode addr ke HRP target ('sp' atau 'spark') tanpa ubah payload */
export function reencodeSparkAddr(addr: string, targetHrp: 'sp' | 'spark') {
  const { enc, dec } = bech32DecodeAny(addr);
  const lib = enc === 'bech32' ? bech32 : bech32m;
  return lib.encode(targetHrp, dec.words); 
}

/** Terima sp1… atau spark1… */
export function looksLikeSparkAddress(addr: string): boolean {
  const a = String(addr || '').trim().toLowerCase();
  return /^(?:sp|spark)1[0-9a-z]{20,}$/i.test(a);
}

/** Bentuk kanonik untuk server (pakai HRP `sp`) */
export function canonicalSparkAddress(addr: string): string {
  const a = String(addr || '').trim();
  if (!looksLikeSparkAddress(a)) return a;
  const lower = a.toLowerCase();
  if (lower.startsWith('sp1')) return lower;
  return reencodeSparkAddr(lower, 'sp'); 
}

export function looksLikeTokenId(id: string): boolean {
  return /^btkn1[0-9a-z]{10,}$/i.test((id || '').trim());
}

export function looksLikeTxId(s: string): boolean {
  const t = (s || '').trim();
  const hex32 = /^[0-9a-f]{32}$/i;
  const hex64 = /^[0-9a-f]{64}$/i;
  const dashed = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  return hex32.test(t) || hex64.test(t) || dashed.test(t);
}

export function parseAmountToBigInt(x: string | number | bigint): bigint {
  if (typeof x === 'bigint') return x;
  if (typeof x === 'number') {
    if (!Number.isFinite(x) || !Number.isInteger(x)) throw new Error('amount must be integer');
    return BigInt(x);
  }
  if (!/^[0-9]+$/.test(x)) throw new Error('amount must be integer (base units)');
  return BigInt(x);
}
