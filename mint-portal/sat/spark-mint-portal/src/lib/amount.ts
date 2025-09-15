export function toBaseUnits(amountStr: string, decimals: number): bigint {
  if (typeof amountStr !== 'string') amountStr = String(amountStr ?? '');
  if (!/^[0-9]+(\.[0-9]+)?$/.test(amountStr)) throw new Error('Invalid amount format');
  const [ints, frac = ''] = amountStr.split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const raw = ints + fracPadded;
  return BigInt(raw.replace(/^0+/, '') || '0');
}
