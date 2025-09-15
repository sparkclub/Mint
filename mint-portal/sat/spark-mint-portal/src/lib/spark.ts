/* eslint-disable @typescript-eslint/no-explicit-any */
import { IssuerSparkWallet } from '@buildonspark/issuer-sdk';

let cachedInit: Awaited<ReturnType<typeof IssuerSparkWallet.initialize>> | null = null;

function safeRequire(name: string): any { try { return require(name); } catch { return {}; } }
function getNet(): 'MAINNET'|'TESTNET'|'SIGNET'|'REGTEST'|'LOCAL' {
  const n = (process.env.SPARK_NETWORK || 'MAINNET').toUpperCase();
  return (['MAINNET','TESTNET','SIGNET','REGTEST','LOCAL'] as const).includes(n as any) ? (n as any) : 'MAINNET';
}
function nonEmpty(s?: string){ return !!(s && String(s).trim().length); }
function tryMake<T>(fn: () => T){ try { return fn(); } catch { return null as unknown as T; } }
function bigintsToStrings<T>(x:T):T{
  return JSON.parse(JSON.stringify(x, (_k,v)=> typeof v === 'bigint' ? v.toString() : v));
}
export function getSdk(){ return safeRequire('@buildonspark/spark-sdk'); }

/** Wallet issuer dari ENV. */
export async function getIssuerWallet() {
  if (cachedInit) return cachedInit.wallet;

  const mnemonicOrSeed =
    (process.env.ISSUER_MNEMONIC || '').trim() ||
    (process.env.ISSUER_SEED_HEX || process.env.ISSUER_SEED || '').trim();

  if (!mnemonicOrSeed) {
    throw new Error('Missing ISSUER_MNEMONIC or ISSUER_SEED_HEX in env');
  }
  const network = getNet();
  cachedInit = await IssuerSparkWallet.initialize({
    mnemonicOrSeed,
    options: { network },
  });
  return cachedInit.wallet;
}

export async function getIssuerAddress(): Promise<string> {
  const w: any = await getIssuerWallet();
  for (const m of ['getSparkAddress', 'getAddress', 'getPaymentAddress']) {
    const fn = w?.[m];
    if (typeof fn === 'function') {
      const addr = await fn.call(w);
      if (addr) return String(addr);
    }
  }
  const maybe = w?.address || w?.sparkAddress || w?.paymentAddress;
  if (maybe) return String(maybe);
  throw new Error('Cannot derive issuer spark address from wallet');
}

export function newTokenService(wallet:any){
  const sdk = getSdk();
  const net = getNet();
  const TT = (sdk && (sdk.TokenTransactionService || sdk.default?.TokenTransactionService));
  if (!TT) throw new Error('TokenTransactionService tidak ada di SDK');

  const networkValue = (sdk.Network || sdk.default?.Network)?.[net] ?? net;

  let tts:any =
    tryMake(() => new TT({ wallet, network: networkValue })) ||
    tryMake(() => new TT(wallet, networkValue)) ||
    (typeof TT.fromWallet === 'function' ? TT.fromWallet(wallet, { network: networkValue }) : null);

  if (!tts){
    tts = Object.create(TT?.prototype || {});
    (tts as any).wallet = wallet;
    (tts as any).network = networkValue;
  }
  return tts;
}

async function startCreateTokenTx(tts:any, p:{tokenName:string;tokenTicker:string;decimals:number;maxSupply:bigint;isFreezable:boolean}){
  const create_camel = { tokenName:p.tokenName, tokenTicker:p.tokenTicker, decimals:p.decimals, maxSupply:p.maxSupply, isFreezable:p.isFreezable };
  const create_snake = { token_name:p.tokenName, token_ticker:p.tokenTicker, decimals:p.decimals, max_supply:p.maxSupply, is_freezable:p.isFreezable };

  const candidates = ['startTokenTransaction','startTokenTransactionV0'];
  const shapes:any[] = [
    { args:[{ version:2, create_input: create_snake }] },
    { args:[{ version:2, createInput:  create_camel }] },
    { args:[{ create_input: create_snake }] },
    { args:[{ createInput:  create_camel }] },
  ];

  const errors:any[] = [];
  for (const name of candidates){
    const fn = (tts as any)[name];
    if (typeof fn !== 'function') continue;
    for (const s of shapes){
      try{
        const tx = await fn.apply(tts, s.args);
        return { ok:true, method:name, shape:s, tx: bigintsToStrings(tx) };
      }catch(e:any){ errors.push({method:name, err:String(e?.message||e)}); }
    }
  }
  return { ok:false, where:'start', errors };
}

async function startMintTokenTx(tts:any, p:{tokenIdentifier:string;tokenAmount:bigint;toSparkAddress:string}){
  const mint_camel = { tokenIdentifier:p.tokenIdentifier, tokenAmount:p.tokenAmount, toSparkAddress:p.toSparkAddress };
  const mint_snake = { token_identifier:p.tokenIdentifier, token_amount:p.tokenAmount, to_spark_address:p.toSparkAddress };

  const candidates = ['startTokenTransaction','startTokenTransactionV0'];
  const shapes:any[] = [
    { args:[{ version:2, mint_input: mint_snake }] },
    { args:[{ version:2, mintInput:  mint_camel }] },
    { args:[{ mint_input: mint_snake }] },
    { args:[{ mintInput:  mint_camel }] },
  ];

  const errors:any[] = [];
  for (const name of candidates){
    const fn = (tts as any)[name];
    if (typeof fn !== 'function') continue;
    for (const s of shapes){
      try{
        const tx = await fn.apply(tts, s.args);
        return { ok:true, method:name, shape:s, tx: bigintsToStrings(tx) };
      }catch(e:any){ errors.push({method:name, err:String(e?.message||e)}); }
    }
  }
  return { ok:false, where:'start', errors };
}

async function signFinalizeBroadcast(tts:any, tx:any){
  const out:any = { steps:[] };

  const siggers = ['createSignaturesForOperators'];
  let sigs:any = null;
  for (const name of siggers){
    const fn = (tts as any)[name];
    if (typeof fn !== 'function') continue;
    for (const args of [[tx],[{ tokenTransaction: tx }]]){
      try { sigs = await fn.apply(tts, args); out.steps.push({step:'sign', method:name, ok:true}); break; } catch(e:any){
        out.steps.push({step:'sign', method:name, ok:false, err:String(e?.message||e)}); }
    }
    if (sigs) break;
  }

  const finalizers = ['finalizeTokenTransaction'];
  let finalTx:any = tx;
  for (const name of finalizers){
    const fn = (tts as any)[name];
    if (typeof fn !== 'function') continue;

    const tryArgs = sigs ? [[tx, sigs],[{ tokenTransaction:tx, signatures:sigs }]] : [[tx],[{ tokenTransaction:tx }]];
    for (const args of tryArgs){
      try { finalTx = await fn.apply(tts, args); out.steps.push({step:'finalize', method:name, ok:true}); break; } catch(e:any){
        out.steps.push({step:'finalize', method:name, ok:false, err:String(e?.message||e)}); }
    }
  }

  const broadcasters = ['broadcastTokenTransaction'];
  let bc:any = null;
  for (const name of broadcasters){
    const fn = (tts as any)[name];
    if (typeof fn !== 'function') continue;
    for (const args of [[finalTx],[{ tokenTransaction: finalTx }]]){
      try { bc = await fn.apply(tts, args); out.steps.push({step:'broadcast', method:name, ok:true, result:bigintsToStrings(bc)}); break; } catch(e:any){
        out.steps.push({step:'broadcast', method:name, ok:false, err:String(e?.message||e)}); }
    }
    if (bc) break;
  }

  const sdk = getSdk();
  try{
    const txId = sdk.getTxId?.(bc) || sdk.getTxIdNoReverse?.(bc) || bc?.txId || bc?.id || finalTx?.id;
    if (txId) out.txId = String(txId);
  }catch(_e){}
  return out;
}

export async function createTokenAndBroadcast(tts:any, p:{tokenName:string;tokenTicker:string;decimals:number;maxSupply:bigint;isFreezable:boolean}){
  const started = await startCreateTokenTx(tts, p);
  if (!started.ok) return { ok:false, stage:'start', details: started };
  const flow = await signFinalizeBroadcast(tts, (started as any).tx);
  return { ok: !!flow.txId, txId: flow.txId || null, started, flow };
}
export async function mintAndBroadcast(tts:any, p:{tokenIdentifier:string;tokenAmount:bigint;toSparkAddress:string}){
  const started = await startMintTokenTx(tts, p);
  if (!started.ok) return { ok:false, stage:'start', details: started };
  const flow = await signFinalizeBroadcast(tts, (started as any).tx);
  return { ok: !!flow.txId, txId: flow.txId || null, started, flow };
}
export async function computeTokenIdentifier(ticker:string, issuerSparkAddress:string){
  const sdk = getSdk();
  const network = sdk.getNetworkFromSparkAddress?.(issuerSparkAddress) || getNet();
  const wallet = await getIssuerWallet();
  const pubkeyHex = await (wallet as any).getIdentityPublicKey?.();
  if (!nonEmpty(pubkeyHex)) throw new Error('issuer public key tidak ditemukan dari wallet');

  const tryArgs = [
    { token_ticker: ticker, issuer_public_key: pubkeyHex, network },
    { ticker, issuerPublicKey: pubkeyHex, network },
    { token_ticker: ticker, issuer_public_key: Buffer.from(String(pubkeyHex), 'hex'), network },
  ];
  for (const a of tryArgs){
    try {
      const id = sdk.encodeBech32mTokenIdentifier?.(a);
      if (typeof id === 'string' && id.startsWith('btkn1')) return id;
    }catch(_e){}
  }
  throw new Error('gagal menghitung tokenIdentifier (btkn1…) dari SDK');
}

export async function dumpSurface() {
  const w: any = await getIssuerWallet();
  const sdk = getSdk();
  return {
    walletMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(w) || {}).sort(),
    walletProps: Object.keys(w || {}).sort(),
    sdkKeys: Object.keys(sdk || {}),
    sdkDefaultKeys: Object.keys((sdk?.default || {})),
  };
}
