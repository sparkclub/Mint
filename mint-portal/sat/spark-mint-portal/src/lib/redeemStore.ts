const used = new Set<string>();

export function alreadyUsed(token: string): boolean {
  return used.has(token);
}

export function markUsed(token: string): void {
  used.add(token);
}
