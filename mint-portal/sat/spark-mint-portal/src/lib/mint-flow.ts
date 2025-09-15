import { getIssuerWalletSimple } from "./issuer-simple";

export type MintThenTransferParams = {
  tokenIdentifier: string;      
  tokenAmount: bigint;         
  receiverSparkAddress: string; 
};

export async function mintThenTransfer(params: MintThenTransferParams) {
  const { tokenIdentifier, tokenAmount, receiverSparkAddress } = params;

  const wallet = await getIssuerWalletSimple();

  const mintTxId = await (wallet as any).mintTokens(tokenAmount);

  const transferTxId = await (wallet as any).transferTokens({
    tokenIdentifier: tokenIdentifier as any,
    tokenAmount,
    receiverSparkAddress,
  });

  return {
    ok: true as const,
    mintTxId: String(mintTxId),
    transferTxId: String(transferTxId),
  };
}
