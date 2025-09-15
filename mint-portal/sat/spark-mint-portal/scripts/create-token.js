require('dotenv').config();
const sdk = require('@buildonspark/spark-sdk');

function asBigInt(x){ return BigInt(String(x)); }

(async () => {
  const {
    SPARK_NETWORK = 'MAINNET',
    ISSUER_MNEMONIC,
    ISSUER_SEED_HEX,
    TOKEN_NAME,
    TOKEN_TICKER,
    TOKEN_DECIMALS = '0',
    TOKEN_MAX_SUPPLY_BASE,
  } = process.env;

  if (!ISSUER_MNEMONIC && !ISSUER_SEED_HEX) {
    throw new Error('Set ISSUER_MNEMONIC atau ISSUER_SEED_HEX di .env');
  }
  if (!TOKEN_NAME || !TOKEN_TICKER || !TOKEN_MAX_SUPPLY_BASE) {
    throw new Error('Set TOKEN_NAME, TOKEN_TICKER, TOKEN_MAX_SUPPLY_BASE di .env');
  }

  const network = sdk.Network?.[SPARK_NETWORK] ?? SPARK_NETWORK;
  const wallet = ISSUER_MNEMONIC
    ? new sdk.SparkWallet({ mnemonic: ISSUER_MNEMONIC, network })
    : new sdk.SparkWallet({ seedHex: ISSUER_SEED_HEX, network });

  const tts = new sdk.TokenTransactionService({ wallet, network });

  const started = await tts.startTokenTransaction({
    version: 2,
    create_input: {
      token_name:   TOKEN_NAME,
      token_ticker: TOKEN_TICKER,
      decimals:     Number(TOKEN_DECIMALS),
      max_supply:   asBigInt(TOKEN_MAX_SUPPLY_BASE),
      is_freezable: true,
    }
  });

  const sigs = await tts.createSignaturesForOperators(started);
  const finalized = await tts.finalizeTokenTransaction(started, sigs);
  const res = await tts.broadcastTokenTransaction(finalized);

  const txId = sdk.getTxId?.(res) || res?.id || res?.txId;
  const issuerPubkey = await wallet.getIdentityPublicKey();
  const tokenIdentifier = sdk.encodeBech32mTokenIdentifier({
    token_ticker: TOKEN_TICKER,
    issuer_public_key: issuerPubkey,
    network: SPARK_NETWORK,
  });

  console.log(JSON.stringify({
    ok: true,
    stage: "create",
    txId,
    tokenIdentifier
  }, null, 2));
})().catch(e => {
  console.error(JSON.stringify({ ok:false, error: e?.message || String(e) }, null, 2));
  process.exit(1);
});
