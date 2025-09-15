import { IssuerSparkWallet } from "@buildonspark/issuer-sdk";

let cached: Awaited<ReturnType<typeof IssuerSparkWallet.initialize>> | null = null;

export async function getIssuerWalletSimple() {
  if (cached) return cached.wallet;

  const mnemonicOrSeed =
    process.env.ISSUER_MNEMONIC?.trim() ||
    process.env.ISSUER_SEED_HEX?.trim() ||
    process.env.ISSUER_SEED?.trim();

  if (!mnemonicOrSeed) {
    throw new Error("ISSUER_MNEMONIC atau ISSUER_SEED_HEX belum diset di env");
  }
  const network = (process.env.SPARK_NETWORK || "MAINNET").toUpperCase() as "MAINNET"|"TESTNET"|"SIGNET"|"REGTEST"|"LOCAL";

  cached = await IssuerSparkWallet.initialize({
    mnemonicOrSeed,
    options: { network: network as any },
  });
  return cached.wallet;
}
