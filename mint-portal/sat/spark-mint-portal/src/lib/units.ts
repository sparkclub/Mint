export function toBaseUnits(amount: string | number, decimals: number): bigint {
  const s = typeof amount === 'number' ? String(amount) : String(amount ?? '');
  if (!/^[0-9]+(\.[0-9]+)?$/.test(s)) throw new Error('Invalid amount format');
  const [ints, frac = ''] = s.split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const raw = ints + fracPadded;
  return BigInt(raw.replace(/^0+/, '') || '0');
}
