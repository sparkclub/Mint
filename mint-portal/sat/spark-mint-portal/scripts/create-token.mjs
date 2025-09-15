import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { IssuerSparkWallet } from '@buildonspark/issuer-sdk';

const root = process.cwd();
const envFile  = path.join(root, '.env');
const envLocal = path.join(root, '.env.local');
if (fs.existsSync(envFile)) dotenv.config({ path: envFile });
else if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });

const ALLOWED = new Set(['MAINNET','TESTNET','SIGNET','REGTEST','LOCAL']);
const rawNet = (process.env.SPARK_NETWORK || 'MAINNET').toUpperCase();
const network = ALLOWED.has(rawNet) ? rawNet : 'MAINNET';

const mnemonicOrSeed = (process.env.ISSUER_MNEMONIC || process.env.ISSUER_SEED_HEX || '').trim();
if (!mnemonicOrSeed) {
  console.error('❌ Missing ISSUER_MNEMONIC or ISSUER_SEED_HEX in .env');
  process.exit(1);
}

const name        = process.env.NEW_TOKEN_NAME        || 'New Token';
const ticker      = process.env.NEW_TOKEN_TICKER      || 'NEW';
const decimals    = Number(process.env.NEW_TOKEN_DECIMALS || '6');
const maxSupply   = BigInt(process.env.NEW_TOKEN_MAX_SUPPLY || '0');
const isFreezable = String(process.env.NEW_TOKEN_FREEZABLE ?? 'true').toLowerCase() === 'true';

console.log(`⚙️  Network: ${network}`);
if (network === 'MAINNET') console.log('⚠️  MAINNET: actions are permanent.');

const { wallet } = await IssuerSparkWallet.initialize({
  mnemonicOrSeed,
  options: { network },
});

if (typeof wallet.createToken !== 'function') {
  console.error('❌ wallet.createToken() not found. Update @buildonspark/issuer-sdk to a version that exposes createToken.');
  console.error('   npm i @buildonspark/issuer-sdk@latest');
  process.exit(1);
}

const txId = await wallet.createToken({
  tokenName: name,
  tokenTicker: ticker,
  decimals,
  maxSupply,
  isFreezable,
});
console.log('✅ Token created. TX:', txId);

const tokenIdentifier = await wallet.getIssuerTokenIdentifier?.();
console.log('🔑 Token Identifier:', tokenIdentifier);

const payoutBaseUnits = process.env.PAYMINT_PAYOUT_BASEUNITS || String(10n ** BigInt(decimals));
console.log('\nAdd to your .env for the Pay→Mint portal:');
console.log(`PAYMINT_PAYOUT_TOKEN_ID=${tokenIdentifier}`);
console.log(`PAYMINT_PAYOUT_BASEUNITS=${payoutBaseUnits}`);
