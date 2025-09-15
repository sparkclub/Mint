import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const DIR = String(process.env.PAYMINT_HOLDERLOCK_DIR || ".paymint_holder");

async function ensureDir() {
  await fs.mkdir(DIR, { recursive: true });
}

function fileFor(addr: string) {
  const safe = addr.trim().toLowerCase();
  const hash = crypto.createHash("sha256").update(safe).digest("hex").slice(0, 16);
  return path.join(DIR, `${safe}-${hash}.json`);
}

export async function isHolderClaimed(address: string): Promise<boolean> {
  await ensureDir();
  try {
    await fs.access(fileFor(address));
    return true;
  } catch { return false; }
}

export async function reserveHolderClaim(address: string): Promise<{ ok: boolean; reason?: string }> {
  await ensureDir();
  const f = fileFor(address);
  try {
    await fs.access(f);
    return { ok: false, reason: "holder_already_claimed" };
  } catch {}
  try {
    const payload = { address, since: Date.now() };
    await fs.writeFile(f, JSON.stringify(payload), { flag: "wx" }); 
    return { ok: true };
  } catch (e: any) {
    if (String(e?.code) === "EEXIST") return { ok: false, reason: "holder_already_claimed" };
    return { ok: false, reason: "holder_claim_write_failed" };
  }
}

export async function rollbackHolderClaim(address: string): Promise<void> {
  const f = fileFor(address);
  try { await fs.unlink(f); } catch {}
}
