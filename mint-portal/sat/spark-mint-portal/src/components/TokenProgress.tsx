'use client';
import { apiPath } from '@/lib/basePath';
import { useEffect, useState } from 'react';

type Summary =
  | { ok:true; percent: number|null; hasMax:boolean; mintedBaseUnits:string; maxSupplyBaseUnits?:string; tokenId:string; network:string; decimals:number }
  | { ok:false; error:string; tokenId?:string; network?:string };

function formatUnits(baseUnits:string, decimals:number){
  try{
    const d = Math.max(0, Math.trunc(decimals||0));
    let n = BigInt(baseUnits);
    const neg = n < 0n; if (neg) n = -n;
    const base = 10n ** BigInt(d);
    const intPart = n / base;
    const fracPart = n % base;
    let frac = fracPart.toString().padStart(d, '0').replace(/0+$/, '');
    const intStr = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg?'-':'') + intStr + (frac ? '.'+frac : '');
  }catch{ return baseUnits; }
}

export default function TokenProgress(){
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(){
    setLoading(true);
    try{
      const r = await fetch(apiPath('/api/token/summary'), { cache:'no-store' });
      const j = await r.json();
      setSummary(j);
    }catch(e:any){
      setSummary({ ok:false, error:String(e?.message||e) });
    }finally{
      setLoading(false);
    }
  }
  useEffect(()=>{ load(); },[]);

  const pct = summary && summary.ok && summary.percent != null
    ? Math.max(0, Math.min(100, summary.percent))
    : null;

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold">
          {summary?.ok
            ? (pct!=null ? `Minted ${pct.toFixed(2)}%` : `Minted ${formatUnits(summary.mintedBaseUnits, summary.decimals)}`)
            : 'Token progress'}
        </div>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>


      <div className="mt-3 h-2 w-full rounded-full bg-white/10 overflow-hidden relative">
        {pct!=null && !loading && (
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #22c55e, #16a34a)'
            }}
          />
        )}

        {loading && (
          <div className="absolute inset-0 overflow-hidden">
            <div
              className="h-full w-2/5 rounded-full animate-progress"
              style={{
                background: 'linear-gradient(90deg, rgba(34,197,94,0.6), rgba(22,163,74,0.95))'
              }}
            />
          </div>
        )}
      </div>

      {summary?.ok && pct!=null && (
        <div className="mt-2 text-xs text-neutral-300">
          {formatUnits(summary.mintedBaseUnits, summary.decimals)}
          {' / '}
          {formatUnits(summary.maxSupplyBaseUnits!, summary.decimals)}
          {' • '}
          <code className="opacity-80">{summary.tokenId}</code>
        </div>
      )}
      {summary?.ok && pct==null && (
        <div className="mt-2 text-xs text-neutral-300">
          {formatUnits(summary.mintedBaseUnits, summary.decimals)} (no max supply reported)
          {' • '}
          <code className="opacity-80">{summary.tokenId}</code>
        </div>
      )}
      {!summary?.ok && summary && (
        <div className="mt-2 text-xs text-red-300 break-all">
          Failed to load{summary.tokenId ? <> for <code>{summary.tokenId}</code></> : null}: {summary.error}
        </div>
      )}

      <style jsx>{`
        @keyframes progressShimmer {
          0% { transform: translateX(-60%); }
          100% { transform: translateX(160%); }
        }
        .animate-progress { animation: progressShimmer 1.2s linear infinite; }
      `}</style>
    </div>
  );
}
