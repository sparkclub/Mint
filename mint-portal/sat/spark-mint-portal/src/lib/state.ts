let currentTokenId: string | null =
  (process.env.PAYMINT_TOKEN_IDENTIFIER ?? null);

export function setCurrentToken(id: string) {
  currentTokenId = id;
  console.log('[state] setCurrentToken =>', id);
}

export function getCurrentToken() {
  return currentTokenId;
}
