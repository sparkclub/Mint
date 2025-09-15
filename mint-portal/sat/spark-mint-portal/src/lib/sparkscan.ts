import { setTimeout as sleep } from "timers/promises";
const NET = (process.env.SPARK_NETWORK || "MAINNET").toUpperCase();
function ua(){const r=Math.random().toString(36).slice(2,8);return `Mozilla/5.0 SparkPortal/${r}`;}

async function fetchJson(url:string, tries=5){
  let last:any;
  for (let i=0;i<tries;i++){
    const r = await fetch(url, { headers:{ "user-agent":ua(), "accept":"application/json" }});
    if (r.ok) return await r.json();
    last = r.status;
    if (r.status === 404) return null;      
    await sleep(r.status===429 ? 1500 + i*1000 : 600);
  }
  throw new Error(`sparkscan ${last}`);
}
async function fetchText(url:string, tries=5){
  let last:any;
  for (let i=0;i<tries;i++){
    const r = await fetch(url, { headers:{ "user-agent":ua(), "accept":"text/html" }});
    if (r.ok) return await r.text();
    last = r.status;
    await sleep(r.status===429 ? 1500 + i*1000 : 600);
  }
  throw new Error(`sparkscan ${last}`);
}

export async function getTxJson(txId:string, net=NET){
  const url = `https://api.sparkscan.io/v1/tx/${txId}?network=${encodeURIComponent(net)}`;
  return await fetchJson(url);
}
export function extractBtknFromJson(obj:any): string|null {
  if (!obj) return null;
  const m = JSON.stringify(obj).match(/(btkn1[0-9a-z]{20,})/i);
  return m ? m[1] : null;
}
export async function findBtknOnAddress(address:string, net=NET, wantTicker?:string){
  const url = `https://www.sparkscan.io/address/${encodeURIComponent(address)}?network=${encodeURIComponent(net)}`;
  const html = await fetchText(url);
  const hits = Array.from(html.matchAll(/(btkn1[0-9a-z]{20,})/ig)).map(m=>m[1]);
  if (!hits.length) return { url, tokenIdentifier:null, candidates:[] as string[] };
  if (!wantTicker) return { url, tokenIdentifier:hits[0], candidates:hits };
  const WANT = wantTicker.toUpperCase();
  let best:{id:string;dist:number}|null = null;
  for (const id of hits){
    const idx = html.indexOf(id); const s=Math.max(0, idx-600), e=Math.min(html.length, idx+600);
    const win = html.slice(s,e).toUpperCase(); const pos = win.indexOf(WANT);
    if (pos>=0){ const dist = Math.abs((s+pos)-idx); if(!best||dist<best.dist) best={id,dist};}
  }
  return { url, tokenIdentifier: best?.id || null, candidates:hits };
}
