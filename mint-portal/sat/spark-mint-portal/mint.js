require('dotenv').config();
const sdk = require('@buildonspark/spark-sdk');

const {
  SPARK_NETWORK = 'MAINNET',
  ISSUER_MNEMONIC,
  ISSUER_SEED_HEX,
  ISSUER_SPARK_ADDRESS = '',
  MINT_RECEIVER_SPARK_ADDRESS,
  TOKEN_NAME,
  TOKEN_TICKER,
  TOKEN_DECIMALS,
  TOKEN_MAX_SUPPLY_BASE,
} = process.env;

function pow10(n){ let x=1n; for(let i=0;i<n;i++) x*=10n; return x; }
function asBigInt(s){ return BigInt(String(s)); }

(async () => {
  if (!ISSUER_MNEMONIC && !ISSUER_SEED_HEX) {
    throw new Error('Set ISSUER_MNEMONIC atau ISSUER_SEED_HEX di .env');
  }
  const network = (sdk.Network?.[SPARK_NETWORK] ?? SPARK_NETWORK);

  const wallet =
    ISSUER_MNEMONIC
      ? new sdk.SparkWallet({ mnemonic: ISSUER_MNEMONIC, network })
      : new sdk.SparkWallet({ seedHex: ISSUER_SEED_HEX, network });

  const tts = new sdk.TokenTransactionService({ wallet, network });

  const createInput = {
    version: 2,
    create_input: {
      token_name:   TOKEN_NAME,
      token_ticker: TOKEN_TICKER,
      decimals:     Number(TOKEN_DECIMALS),
      max_supply:   asBigInt(TOKEN_MAX_SUPPLY_BASE),
      is_freezable: true,
    }
  };

  const started = await tts.startTokenTransaction(createInput);

  const sigs = await tts.createSignaturesForOperators(started);
  const finalized = await tts.finalizeTokenTransaction(started, sigs);
  const createdTx = await tts.broadcastTokenTransaction(finalized);

  const createTxId = sdk.getTxId?.(createdTx) || createdTx?.id || createdTx?.txId;
  console.log('[CREATE] txId =', createTxId);

  const issuerPubkey = await wallet.getIdentityPublicKey();
  const tokenIdentifier = sdk.encodeBech32mTokenIdentifier({
    token_ticker: TOKEN_TICKER,
    issuer_public_key: issuerPubkey,
    network: SPARK_NETWORK,
  });
  console.log('[BTKN] tokenIdentifier =', tokenIdentifier);


  const receiver = MINT_RECEIVER_SPARK_ADDRESS || ISSUER_SPARK_ADDRESS;
  if (!receiver) throw new Error('Set MINT_RECEIVER_SPARK_ADDRESS atau ISSUER_SPARK_ADDRESS');

  const one = pow10(Number(TOKEN_DECIMALS));
  const mintStarted = await tts.startTokenTransaction({
    version: 2,
    mint_input: {
      token_identifier: tokenIdentifier,
      token_amount: one,
      to_spark_address: receiver,
    }
  });
  const mintSigs = await tts.createSignaturesForOperators(mintStarted);
  const mintFinal = await tts.finalizeTokenTransaction(mintStarted, mintSigs);
  const mintTx = await tts.broadcastTokenTransaction(mintFinal);
  const mintTxId = sdk.getTxId?.(mintTx) || mintTx?.id || mintTx?.txId;

  console.log('[MINT] 1 unit →', receiver, 'txId =', mintTxId);
})().catch(e => {
  console.error('ERROR:', e?.message || e);
  process.exit(1);
});
