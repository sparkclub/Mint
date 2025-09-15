import { IssuerSparkWallet } from '@buildonspark/issuer-sdk';

let _wallet: any | null = null;

export async function getIssuerWallet() {
  if (_wallet) return _wallet;

  const NETWORK = process.env.NETWORK || 'MAINNET';
  const mnemonicOrSeed =
    process.env.ISSUER_MNEMONIC?.trim() ||
    process.env.ISSUER_SEED_HEX?.trim() ||
    undefined;

  const { wallet, mnemonic } = await IssuerSparkWallet.initialize({
    mnemonicOrSeed,
    options: { network: 'MAINNET' }
  });

  if (!mnemonicOrSeed && mnemonic) {
    console.log('⚠️  No mnemonic provided. Generated NEW mnemonic (dev only):', mnemonic);
  }

  _wallet = wallet;
  return _wallet;
}
