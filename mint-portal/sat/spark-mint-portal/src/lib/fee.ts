import { cfg } from "./config";
import { getIssuerWallet } from "./spark";

export async function verifyFeePaid(params: { txId?: string }) {
  if (!cfg.feeAddress || cfg.feeAmount <= 0n) return true;

  if (!cfg.verifyStrict) {
    if (!params.txId || params.txId.length < 4) throw new Error("fee txId required (dev mode)");
    return true;
  }

  throw new Error("Strict fee verification not implemented yet");
}
