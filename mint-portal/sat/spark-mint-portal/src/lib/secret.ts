import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_FILE = process.env.PAYMINT_AUTO_SECRET_FILE || ".paymint_secret";

export function getSigningSecretSync(): string {
  const env = process.env.PAYMINT_SIGNING_SECRET;
  if (env && env.length >= 16) return env;

  const root = process.cwd();
  const file = path.join(root, DEFAULT_FILE);

  try {
    if (fs.existsSync(file)) {
      const s = fs.readFileSync(file, "utf8").trim();
      if (s) return s;
    }
  } catch { /* ignore */ }

  const s = randomBytes(32).toString("base64url");
  try {
    fs.writeFileSync(file, s, { flag: "wx", mode: 0o600 });
    console.log(`[paymint] Created ${DEFAULT_FILE} with a new signing secret.`);
  } catch {
    console.warn(`[paymint] Using ephemeral signing secret (file write failed).`);
  }
  return s;
}
