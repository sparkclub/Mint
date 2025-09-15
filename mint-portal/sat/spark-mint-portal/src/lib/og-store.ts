import { promises as fsp } from "fs";
import { join } from "path";
import { createHash } from "crypto";

function baseDir() {
  return String(process.env.PAYMINT_OGLOCK_DIR || ".paymint_og");
}
function keyOf(addr: string) {
  const h = createHash("sha256").update(addr.toLowerCase()).digest("hex").slice(0, 24);
  return `${addr.toLowerCase()}__${h}.lock`;
}
async function ensureDir(d: string) {
  try { await fsp.mkdir(d, { recursive: true }); } catch {}
}
async function listLocks(d: string) {
  try { const all = await fsp.readdir(d); return all.filter(n => n.endsWith(".lock")); } catch { return []; }
}

export async function checkOgUsed(address: string): Promise<{ used: boolean }> {
  const d = baseDir();
  const p = join(d, keyOf(address));
  try { await fsp.access(p); return { used: true }; } catch { return { used: false }; }
}
export async function reserveOgClaim(address: string): Promise<{ ok: boolean; reason?: string }> {
  const limit = Number(process.env.PAYMINT_OG_GLOBAL_LIMIT ?? "0");
  const lim = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;

  const d = baseDir();
  await ensureDir(d);

  const used = await checkOgUsed(address);
  if (used.used) return { ok: false, reason: "og_address_used" };

  if (lim > 0) {
    const now = await listLocks(d);
    if (now.length >= lim) return { ok: false, reason: "og_sold_out" };
  }

  const p = join(d, keyOf(address));
  try {
    await fsp.writeFile(p, new Date().toISOString(), { flag: "wx" });
    return { ok: true };
  } catch {
    return { ok: false, reason: "og_race" };
  }
}
export async function rollbackOgClaim(address: string): Promise<void> {
  const d = baseDir();
  const p = join(d, keyOf(address));
  try { await fsp.unlink(p); } catch {}
}
