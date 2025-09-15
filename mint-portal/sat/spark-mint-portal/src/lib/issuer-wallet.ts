type Net = 'MAINNET'|'TESTNET'|'REGTEST';

let cachedWalletSparkSdk: any = null;
let cachedWalletIssuerSdk: any = null;
let cachedSparkSdk: any = null;
let cachedIssuerSdk: any = null;

function getNet(): Net {
  const n = (process.env.SPARK_NETWORK || 'MAINNET').toUpperCase();
  return (n === 'TESTNET' || n === 'REGTEST') ? (n as Net) : 'MAINNET';
}
function nonEmpty(s?: string){ return !!(s && String(s).trim().length); }
function tryMake<T>(fn: () => T){ try { return fn(); } catch { return null as unknown as T; } }
function bigintsToStrings<T>(x:T):T{
  return JSON.parse(JSON.stringify(x, (_k,v)=> typeof v === 'bigint' ? v.toString() : v));
}

export async function getSparkSdk(){
  if (!cachedSparkSdk){
    cachedSparkSdk = await import('@buildonspark/spark-sdk');
  }
  return cachedSparkSdk as any;
}
export async function getIssuerSdk(){
  if (!cachedIssuerSdk){
    cachedIssuerSdk = await import('@buildonspark/issuer-sdk');
  }
  return cachedIssuerSdk as any;
}

export async function getIssuerWallet(){
  if (cachedWalletSparkSdk) return cachedWalletSparkSdk;
  const sdk = await getSparkSdk();
  const net = getNet();

  const mnemonic = process.env.ISSUER_MNEMONIC;
  const seedHex  = process.env.ISSUER_SEED_HEX || process.env.ISSUER_SEED;
  if (!nonEmpty(mnemonic) && !nonEmpty(seedHex)) {
    throw new Error('Missing issuer secret: set ISSUER_MNEMONIC atau ISSUER_SEED_HEX di .env');
  }

  const SparkWallet   = (sdk as any).SparkWallet || (sdk as any).default?.SparkWallet;
  const Network       = (sdk as any).Network || (sdk as any).default?.Network;
  const WalletConfig  = (sdk as any).WalletConfig || (sdk as any).default?.WalletConfig;
  const addPrivateKeys= (sdk as any).addPrivateKeys || (sdk as any).default?.addPrivateKeys;
  if (!SparkWallet) throw new Error('spark-sdk mismatch: SparkWallet tidak ditemukan');

  const networkValue = Network?.[net] ?? net;
  let wallet:any =
    tryMake(() => new SparkWallet({ mnemonic, network: networkValue })) ||
    tryMake(() => new SparkWallet({ seedHex,  network: networkValue })) ||
    tryMake(() => new SparkWallet(mnemonic ?? seedHex, networkValue)) ||
    (typeof WalletConfig === 'function'
      ? tryMake(() => new SparkWallet(new WalletConfig({ mnemonic, seedHex, network: networkValue })))
      : null);

  if (!wallet && typeof addPrivateKeys === 'function'){
    const tmp = tryMake(() => new SparkWallet());
    try { addPrivateKeys(tmp, [mnemonic ?? seedHex!], networkValue); wallet = tmp; } catch {}
  }

  if (!wallet) throw new Error('spark-sdk mismatch: gagal inisialisasi wallet');

  cachedWalletSparkSdk = wallet;
  return wallet;
}

async function getIssuerWalletViaIssuerSdk(){
  if (cachedWalletIssuerSdk) return cachedWalletIssuerSdk;
  const isdk = await getIssuerSdk();

  const mnemonicOrSeed =
    process.env.ISSUER_MNEMONIC?.trim() ||
    process.env.ISSUER_SEED_HEX?.trim() ||
    process.env.ISSUER_SEED?.trim();

  if (!nonEmpty(mnemonicOrSeed)) {
    throw new Error('Missing issuer secret untuk issuer-sdk: set ISSUER_MNEMONIC atau ISSUER_SEED_HEX');
  }
  const network = (process.env.SPARK_NETWORK || 'MAINNET').toUpperCase();

  const init = await (isdk as any).IssuerSparkWallet?.initialize?.({
    mnemonicOrSeed,
    options: { network }
  });
  if (!init?.wallet) throw new Error('issuer-sdk: initialize gagal (wallet null)');
  cachedWalletIssuerSdk = init.wallet;
  return cachedWalletIssuerSdk;
}

function buildClientsFromSparkSdk(sdk:any, networkValue:any, rpcUrl?:string){
  const tokenClient =
    tryMake(() => sdk.createSparkTokenClient?.({ network: networkValue, rpcUrl })) ||
    tryMake(() => sdk.createSparkTokenClient?.(networkValue)) ||
    null;

  const sparkClient =
    tryMake(() => sdk.createSparkClient?.({ network: networkValue, rpcUrl })) ||
    tryMake(() => sdk.createSparkClient?.(networkValue)) ||
    null;

  return { tokenClient, sparkClient };
}

async function newTokenServiceViaSparkSdk(wallet:any){
  const sdk = await getSparkSdk();
  const net = getNet();
  const TT = (sdk as any).TokenTransactionService || (sdk as any).default?.TokenTransactionService;
  if (!TT) return null; 

  const networkValue = ((sdk as any).Network || (sdk as any).default?.Network)?.[net] ?? net;
  const rpcUrl = process.env.SPARK_RPC_URL || undefined;

  const { tokenClient, sparkClient } = buildClientsFromSparkSdk(sdk, networkValue, rpcUrl);

  let tts:any =
    tryMake(() => new TT({ wallet, network: networkValue, tokenClient, sparkTokenClient: tokenClient, sparkClient })) ||
    tryMake(() => new TT({ wallet, network: networkValue, sparkTokenClient: tokenClient })) ||
    tryMake(() => new TT({ wallet, network: networkValue, tokenClient })) ||
    tryMake(() => (TT as any).withClients?.({ wallet, tokenClient, sparkClient, network: networkValue })) ||
    tryMake(() => new TT({ wallet, network: networkValue })) ||
    tryMake(() => new TT(wallet, networkValue));

  if (!tts){
    tts = Object.create(TT?.prototype || {});
    (tts as any).wallet = wallet;
    (tts as any).network = networkValue;
  }
  (tts as any).tokenClient = (tts as any).tokenClient || tokenClient || {};
  (tts as any).sparkTokenClient = (tts as any).sparkTokenClient || tokenClient || {};
  (tts as any).sparkClient = (tts as any).sparkClient || sparkClient || {};

  return tts;
}

async function newTokenServiceViaIssuerSdk(wallet:any){
  const isdk = await getIssuerSdk();
  const net = getNet();

  const TT =
    (isdk as any).TokenTransactionService ||
    (isdk as any).default?.TokenTransactionService ||
    (isdk as any).IssuerTokenTransactionService ||
    (isdk as any).default?.IssuerTokenTransactionService;

  if (!TT) return null;

  const networkValue =
    (isdk as any).Network?.[net] ||
    (isdk as any).default?.Network?.[net] ||
    net;

  let tts:any =
    tryMake(() => new TT({ wallet, network: networkValue })) ||
    tryMake(() => new TT(wallet, networkValue));

  if (!tts){
    tts = Object.create(TT?.prototype || {});
    (tts as any).wallet = wallet;
    (tts as any).network = networkValue;
  }
  return tts;
}

export async function newTokenService(wallet:any){
  const prefer = String(process.env.MINT_SDK_FLAVOR || '').toUpperCase(); 
  if (prefer === 'ISSUER') {
    return (await newTokenServiceViaIssuerSdk(
      wallet ?? await getIssuerWalletViaIssuerSdk()
    )) || (await newTokenServiceViaSparkSdk(wallet));
  }
  return (await newTokenServiceViaSparkSdk(wallet)) ||
         (await newTokenServiceViaIssuerSdk(
           wallet ?? await getIssuerWalletViaIssuerSdk()
         ));
}

async function startMintTokenTx(tts:any, p:{tokenIdentifier:string;tokenAmount:bigint;toSparkAddress:string}){
  const mint_camel = { tokenIdentifier:p.tokenIdentifier, tokenAmount:p.tokenAmount, toSparkAddress:p.toSparkAddress };
  const mint_snake = { token_identifier:p.tokenIdentifier, token_amount:p.tokenAmount, to_spark_address:p.toSparkAddress };

  const candidates = ['startTokenTransaction','startTokenTransactionV0','startMint','startTokenMint'];
  const shapes:any[] = [
    { args:[{ version:2, mint_input: mint_snake }] },
    { args:[{ version:2, mintInput:  mint_camel }] },
    { args:[{ mint_input: mint_snake }] },
    { args:[{ mintInput:  mint_camel }] },
    { args:[mint_snake] },
    { args:[mint_camel] },
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

  const sdk = await getSparkSdk().catch(()=>null);
  const isdk = await getIssuerSdk().catch(()=>null);
  const globals = [
    { mod: sdk,   pref: 'spark'  },
    { mod: isdk,  pref: 'issuer' },
    { mod: sdk?.default,   pref: 'spark.default' },
    { mod: isdk?.default,  pref: 'issuer.default' },
  ];
  for (const g of globals){
    if (!g.mod) continue;
    for (const name of ['startTokenTransaction','startTokenTransactionV0','startMint','startTokenMint']){
      const fn = (g.mod as any)[name];
      if (typeof fn !== 'function') continue;
      for (const s of shapes){
        try{
          const tx = await fn.apply(g.mod, [{ ...s.args?.[0], wallet: (tts as any).wallet, network: (tts as any).network }]);
          return { ok:true, method:`${g.pref}.${name}`, shape:s, tx: bigintsToStrings(tx) };
        }catch(e:any){ errors.push({method:`${g.pref}.${name}`, err:String(e?.message||e)}); }
      }
    }
  }

  return { ok:false, where:'start', errors };
}

async function signFinalizeBroadcast(tts:any, tx:any){
  const out:any = { steps:[] };

  const siggers = ['createSignaturesForOperators','createSignatures','sign'];
  let sigs:any = null;
  for (const name of siggers){
    const fn = (tts as any)[name];
    if (typeof fn !== 'function') continue;
    for (const args of [[tx],[{ tokenTransaction: tx }]]){
      try { sigs = await fn.apply(tts, args); out.steps.push({step:'sign', method:name, ok:true}); break; } catch(e:any){
        out.steps.push({step:'sign', method:name, ok:false, err:String(e?.message||e)});
      }
    }
    if (sigs) break;
  }

  const finalizers = ['finalizeTokenTransaction','finalize'];
  let finalTx:any = tx;
  for (const name of finalizers){
    const fn = (tts as any)[name];
    if (typeof fn !== 'function') continue;
    const tryArgs = sigs ? [[tx, sigs],[{ tokenTransaction:tx, signatures:sigs }]] : [[tx],[{ tokenTransaction:tx }]];
    for (const args of tryArgs){
      try { finalTx = await fn.apply(tts, args); out.steps.push({step:'finalize', method:name, ok:true}); break; } catch(e:any){
        out.steps.push({step:'finalize', method:name, ok:false, err:String(e?.message||e)});
      }
    }
  }

  const broadcasters = ['broadcastTokenTransaction','broadcast'];
  let bc:any = null;
  for (const name of broadcasters){
    const fn = (tts as any)[name];
    if (typeof fn !== 'function') continue;
    for (const args of [[finalTx],[{ tokenTransaction: finalTx }]]){
      try { bc = await fn.apply(tts, args); out.steps.push({step:'broadcast', method:name, ok:true, result:bigintsToStrings(bc)}); break; } catch(e:any){
        out.steps.push({step:'broadcast', method:name, ok:false, err:String(e?.message||e)});
      }
    }
    if (bc) break;
  }

  const sdk = await getSparkSdk().catch(()=>null);
  try{
    const txId = sdk?.getTxId?.(bc) || sdk?.getTxIdNoReverse?.(bc) || bc?.txId || bc?.id || finalTx?.id;
    if (txId) out.txId = String(txId);
  }catch(_e){}
  return out;
}

export async function mintAndBroadcast(tts:any, p:{tokenIdentifier:string;tokenAmount:bigint;toSparkAddress:string}){
  let started = await startMintTokenTx(tts, p);
  if (!started.ok) {
    try {
      const altTts =
        (await newTokenServiceViaSparkSdk((tts as any).wallet)) ||
        (await newTokenServiceViaIssuerSdk((tts as any).wallet)) ||
        null;
      if (altTts) started = await startMintTokenTx(altTts, p);
    } catch {}
  }
  if (!started.ok) return { ok:false, stage:'start', details: started };

  const flow = await signFinalizeBroadcast(tts, (started as any).tx);
  return { ok: !!flow.txId, txId: flow.txId || null, started, flow };
}
