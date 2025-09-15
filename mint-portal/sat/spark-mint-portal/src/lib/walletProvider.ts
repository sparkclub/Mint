import { getProviders, getProviderById } from "sats-connect";

type AnyProvider = { request: (method: string, params?: any) => Promise<any> };
type ProviderMeta = { id: string; name?: string; methods?: string[] };

export function listProviders(): ProviderMeta[] {
  try { return (getProviders?.() as any) || []; } catch { return []; }
}

export function listWBIPRaw(): ProviderMeta[] {
  if (typeof window === "undefined") return [];
  const anyWin = window as any;
  const arr = anyWin?.btc_providers;
  if (!Array.isArray(arr)) return [];
  return arr.map((p: any) => ({ id: p?.id, name: p?.name, methods: p?.methods }));
}

export async function waitAndPickBitBit(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const list = listProviders();
    if (list.length) {
      const lc = (s?: string) => (s || "").toLowerCase();
      const hit = list.find(p => lc(p.name).includes("bitbit") || lc(p.id).includes("bitbit"));
      if (hit) {
        const provider = getProviderById(hit.id) as unknown as AnyProvider;
        return { meta: hit, provider };
      }
    }
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}
