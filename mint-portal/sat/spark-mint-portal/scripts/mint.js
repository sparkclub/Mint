require('dotenv').config();
const sdk = require('@buildonspark/spark-sdk');

function pow10(n){ let x=1n; for(let i=0;i<n;i++) x*=10n; return x; }
function asBigInt(x){ return BigInt(String(x)); }

(async () => {
  const {
    SPARK_NETWORK = 'MAINNET',
    ISSUER_MNEMONIC,
    ISSUER_SEED_HEX,
    ISSUER_SPARK_ADDRESS = '',
    MINT_RECEIVER_SPARK_ADDRESS,
    TOKEN_TICKER,
    TOKEN_IDENTIFIER,
    TOKEN_DECIMALS = '0',
    MINT_AMOUNT_BASE,
    MINT_UNITS,
  } = process.env;

  if (!ISSUER_MNEMONIC && !ISSUER_SEED_HEX) {
    throw new Error('Set ISSUER_MNEMONIC atau ISSUER_SEED_HEX di .env');
  }

  const network = sdk.Network?.[SPARK_NETWORK] ?? SPARK_NETWORK;

  const wallet = ISSUER_MNEMONIC
    ? new sdk.SparkWallet({ mnemonic: ISSUER_MNEMONIC, network })
    : new sdk.SparkWallet({ seedHex: ISSUER_SEED_HEX, network });

  const receiver = MINT_RECEIVER_SPARK_ADDRESS || ISSUER_SPARK_ADDRESS;
  if (!receiver) throw new Error('Set MINT_RECEIVER_SPARK_ADDRESS atau ISSUER_SPARK_ADDRESS');

  let tokenIdentifier = TOKEN_IDENTIFIER;
  if (!tokenIdentifier) {
    if (!TOKEN_TICKER) throw new Error('Set TOKEN_TICKER di .env atau TOKEN_IDENTIFIER langsung');
    const issuerPubkey = await wallet.getIdentityPublicKey();
    tokenIdentifier = sdk.encodeBech32mTokenIdentifier({
      token_ticker: TOKEN_TICKER,
      issuer_public_key: issuerPubkey,
      network: SPARK_NETWORK,
    });
  }

  let amountBase;
  if (MINT_AMOUNT_BASE) {
    amountBase = asBigInt(MINT_AMOUNT_BASE);
  } else if (MINT_UNITS) {
    amountBase = asBigInt(MINT_UNITS) * pow10(Number(TOKEN_DECIMALS || '0'));
  } else {
    amountBase = pow10(Number(TOKEN_DECIMALS || '0'));
  }

  const tts = new sdk.TokenTransactionService({ wallet, network });

  const started = await tts.startTokenTransaction({
    version: 2,
    mint_input: {
      token_identifier: tokenIdentifier,
      token_amount: amountBase,
      to_spark_address: receiver,
    },
  });

  const sigs = await tts.createSignaturesForOperators(started);
  const finalized = await tts.finalizeTokenTransaction(started, sigs);
  const res = await tts.broadcastTokenTransaction(finalized);

  const txId = sdk.getTxId?.(res) || res?.id || res?.txId;
  console.log(JSON.stringify({
    ok: true,
    tokenIdentifier,
    receiver,
    amount: amountBase.toString(),
    txId,
  }, null, 2));
})().catch(e => {
  console.error(JSON.stringify({ ok:false, error: e?.message || String(e) }, null, 2));
  process.exit(1);
});
