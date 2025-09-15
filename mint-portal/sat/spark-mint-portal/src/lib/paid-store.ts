import { promises as fs } from "fs";
import path from "path";

type Store = { paidCount: number };

function stateDir() {
  return String(process.env.PAYMINT_TXLOCK_DIR || ".paymint_tx");
}
function paidFile() {
  return path.join(stateDir(), "paid.json");
}
async function load(): Promise<Store> {
  try {
    await fs.mkdir(stateDir(), { recursive: true });
    const buf = await fs.readFile(paidFile(), "utf8");
    const j = JSON.parse(buf);
    return { paidCount: Number(j?.paidCount || 0) };
  } catch {
    return { paidCount: 0 };
  }
}
async function save(s: Store) {
  await fs.mkdir(stateDir(), { recursive: true });
  await fs.writeFile(paidFile(), JSON.stringify(s), "utf8");
}
export async function peekPaidCount() {
  const st = await load();
  return { count: st.paidCount };
}
export async function reservePaidSlot(sizes: number[]) {
  const st = await load();
  let acc = 0;
  for (let i = 0; i < sizes.length; i++) {
    const cap = sizes[i];
    if (st.paidCount < acc + cap) {
      const slot = st.paidCount - acc + 1;
      st.paidCount += 1;
      await save(st);
      return { ok: true as const, cohortIndex: i + 1, slotIndex: slot };
    }
    acc += cap;
  }
  return { ok: false as const, reason: "paid_sold_out" as const };
}
export async function rollbackPaidSlot() {
  const st = await load();
  if (st.paidCount > 0) st.paidCount -= 1;
  await save(st);
}
