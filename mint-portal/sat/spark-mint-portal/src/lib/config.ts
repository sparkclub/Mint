export const cfg = {
  network: (process.env.SPARK_NETWORK || "MAINNET").toUpperCase(),
  verifierMode: (process.env.FEE_VERIFIER_MODE || "SCRAPE_SPARKSCAN").toUpperCase(),

  feeAddress: process.env.PAYMINT_FEE_SPARK_ADDRESS || "",
  feeAmount:  BigInt(process.env.PAYMINT_PRICE_SATS || "0"),
  feeTokenId: process.env.PAYMINT_TOKEN_IDENTIFIER || "",
  verifyStrict:
    (process.env.PAYMINT_VERIFY_STRICT === "1") ||
    (process.env.VERIFY_STRICT === "1"),

  fixedRecipient: process.env.FIXED_RECIPIENT_SPARK || "",

  paymint: {
    feeAddress: process.env.PAYMINT_FEE_SPARK_ADDRESS || "",
    basePrice:  BigInt(process.env.PAYMINT_PRICE_SATS || "0"),
    tokenId:    process.env.PAYMINT_TOKEN_IDENTIFIER || "",
    payoutBase: BigInt(process.env.PAYMINT_TOKEN_PAYOUT_BASE || "0"),
  },
} as const;
