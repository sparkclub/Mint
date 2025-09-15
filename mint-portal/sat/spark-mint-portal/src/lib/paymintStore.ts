export type PayOrder = {
  id: string;
  feeAddress: string;
  amount: bigint;   
  since: number;    
  receiver: string; 
  done: boolean;
};
const mem = new Map<string, PayOrder>();

export function newOrder(feeAddress:string, base:bigint, receiver:string){
  const id = Math.random().toString(36).slice(2);
  const suffix = BigInt(1 + Math.floor(Math.random()*97)); 
  const o: PayOrder = { id, feeAddress, amount: base + suffix, since: Date.now(), receiver, done:false };
  mem.set(id, o);
  return o;
}
export function getOrder(id:string){ return mem.get(id) || null; }
export function markDone(id:string){ const o=mem.get(id); if(o) o.done=true; }
