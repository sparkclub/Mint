type Req = {
  id: string;
  address: string;
  amount: bigint;
  since: number; 
  receiver: string; 
};
const mem = new Map<string, Req>();

export function newFeeRequest(address: string, base: bigint, receiver?: string) {
  const id = Math.random().toString(36).slice(2);
  const suffix = BigInt(1 + Math.floor(Math.random() * 97));
  const amount = base + suffix;
  const since = Date.now();
  const rec: Req = { id, address, amount, since, receiver: receiver || "" };
  mem.set(id, rec);
  return rec;
}
export function getFeeRequest(id: string) { return mem.get(id) || null; }
export function delFeeRequest(id: string) { mem.delete(id); }
