import { promises as fs } from "fs";
import path from "path";

type Store = { claimed: number; used: Record<string, true> };

function stateDir() {
  return String(process.env.PAYMINT_TXLOCK_DIR || ".paymint_tx");
}
function fcfsFile() {
  return path.join(stateDir(), "fcfs.json");
}
async function load(): Promise<Store> {
  try {
    await fs.mkdir(stateDir(), { recursive: true });
    const buf = await fs.readFile(fcfsFile(), "utf8");
    const j = JSON.parse(buf);
    return { claimed: Number(j?.claimed || 0), used: j?.used && typeof j.used === "object" ? j.used : {} };
  } catch {
    return { claimed: 0, used: {} };
  }
}
async function save(s: Store) {
  await fs.mkdir(stateDir(), { recursive: true });
  await fs.writeFile(fcfsFile(), JSON.stringify(s), "utf8");
}

export async function peekFcfsCount() {
  const limit = Number(process.env.PAYMINT_COHORT_FCFS_FREE ?? "1000");
  const st = await load();
  return { count: st.claimed, limit, soldOut: st.claimed >= limit };
}
export async function checkFcfsUsed(addr: string) {
  const st = await load();
  return { used: !!st.used[addr.toLowerCase()] };
}
export async function reserveFcfsSlot(addr: string, limit: number) {
  const st = await load();
  const key = addr.toLowerCase();
  if (st.used[key]) return { ok: false as const, reason: "fcfs_address_used" };
  if (st.claimed >= limit) return { ok: false as const, reason: "fcfs_sold_out" };
  st.used[key] = true;
  st.claimed += 1;
  await save(st);
  return { ok: true as const };
}
export async function rollbackFcfsSlot(addr: string) {
  const st = await load();
  const key = addr.toLowerCase();
  if (st.used[key]) {
    delete st.used[key];
    if (st.claimed > 0) st.claimed -= 1;
    await save(st);
  }
}
