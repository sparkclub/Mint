import { IssuerSparkWallet } from '@buildonspark/issuer-sdk';

const NETWORKS = ['MAINNET','TESTNET','SIGNET','REGTEST','LOCAL'] as const;
type Net = typeof NETWORKS[number];

function resolveNetwork(): Net {
  const raw = (process.env.SPARK_NETWORK || 'MAINNET').toUpperCase();
  return (NETWORKS.includes(raw as Net) ? (raw as Net) : 'MAINNET');
}

async function main(){
  const network = resolveNetwork();

  const mnemonicOrSeed =
    process.env.ISSUER_MNEMONIC?.trim() ||
    process.env.ISSUER_SEED_HEX?.trim();

  if (!mnemonicOrSeed) throw new Error('Missing ISSUER_MNEMONIC or ISSUER_SEED_HEX');

  const name        = process.env.NEW_TOKEN_NAME        || 'New Token';
  const ticker      = process.env.NEW_TOKEN_TICKER      || 'NEW';
  const decimals    = Number(process.env.NEW_TOKEN_DECIMALS || '6');
  const maxSupply   = BigInt(process.env.NEW_TOKEN_MAX_SUPPLY || '0'); 
  const isFreezable = String(process.env.NEW_TOKEN_FREEZABLE ?? 'true').toLowerCase() === 'true';

  const { wallet } = await IssuerSparkWallet.initialize({
    mnemonicOrSeed,
    options: { network },
  });

  const txId = await (wallet as any).createToken?.({
    tokenName: name,
    tokenTicker: ticker,
    decimals,
    maxSupply,
    isFreezable,
  });
  if (!txId) throw new Error('wallet.createToken() not found. Update @buildonspark/issuer-sdk.');

  console.log('✅ Token created. TX:', txId);

  const tokenIdentifier = await (wallet as any).getIssuerTokenIdentifier?.();
  console.log('🔑 Token Identifier:', tokenIdentifier);

  const payoutBaseUnits = process.env.PAYMINT_PAYOUT_BASEUNITS || String(10n ** BigInt(decimals));
  console.log('\nAdd to your .env for the Pay→Mint portal:');
  console.log(`PAYMINT_PAYOUT_TOKEN_ID=${tokenIdentifier}`);
  console.log(`PAYMINT_PAYOUT_BASEUNITS=${payoutBaseUnits}`);
}

main().catch((e)=>{ console.error('ERR:', e?.message || e); process.exit(1); });
