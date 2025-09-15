import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { IssuerSparkWallet } from '@buildonspark/issuer-sdk';

const root = process.cwd();
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const ALLOWED = new Set(['MAINNET','TESTNET','SIGNET','REGTEST','LOCAL']);
const rawNet = (process.env.SPARK_NETWORK || 'TESTNET').toUpperCase();
const network = ALLOWED.has(rawNet) ? rawNet : 'TESTNET';

console.log(`⚙️  Network: ${network}`);
if (network === 'MAINNET') console.log('⚠️  MAINNET: keep this mnemonic secret!');

const { wallet, mnemonic } = await IssuerSparkWallet.initialize({
  options: { network },
});

if (!mnemonic) {
  console.error('Failed to generate mnemonic via SDK.');
  process.exit(1);
}

console.log('\n🔑 NEW ISSUER MNEMONIC (SAVE IT NOW):');
console.log(mnemonic);

const line = `\nISSUER_MNEMONIC="${mnemonic}"\n`;
try {
  if (!fs.existsSync(envPath)) fs.writeFileSync(envPath, '', { mode: 0o600 });
  fs.appendFileSync(envPath, line, { mode: 0o600 });
  console.log(`\n📝 Appended to .env: ISSUER_MNEMONIC="***"`);
} catch {
  console.warn('Could not write to .env, please add it manually.');
}
