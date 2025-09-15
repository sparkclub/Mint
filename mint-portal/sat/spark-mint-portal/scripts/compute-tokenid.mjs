import { getIssuerWallet, getSdk } from '../src/lib/issuer-wallet.js';

const TICKER = process.env.PAYMINT_PAYOUT_TICKER || 'BTKN1';

(async () => {
  try {
    const sdk = await getSdk();
    const w = await getIssuerWallet();

    let pubhex = null;
    try { pubhex = await w.getIdentityPublicKey?.(); } catch {}
    try { if (!pubhex) pubhex = await w.getPublicKeyHex?.(); } catch {}
    try { if (!pubhex && typeof w.publicKeyHex === 'string') pubhex = w.publicKeyHex; } catch {}
    if (!pubhex) throw new Error('issuer public key tidak ditemukan dari wallet');

    const network = (sdk.getNetworkFromSparkAddress?.(await w.getSparkAddress?.())) ||
                    (process.env.SPARK_NETWORK || 'MAINNET');

    const argsList = [
      { token_ticker: TICKER, issuer_public_key: pubhex, network },
      { ticker: TICKER, issuerPublicKey: pubhex, network },
    ];

    let id = null;
    for (const a of argsList){
      try {
        const r = sdk.encodeBech32mTokenIdentifier?.(a);
        if (typeof r === 'string' && r.startsWith('btkn1')) { id = r; break; }
      } catch {}
    }
    if (!id) throw new Error('encodeBech32mTokenIdentifier gagal. Coba buat token dulu atau cek SDK.');

    console.log(id);
  } catch (e) {
    console.error('Gagal compute token id:', e?.message || e);
    process.exit(1);
  }
})();
