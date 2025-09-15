import fs from 'node:fs';
import path from 'node:path';

export async function upsertEnv(pairs: Record<string, string>, filePath = '.env.local') {
  for (const [k, v] of Object.entries(pairs)) process.env[k] = v;

  if (process.env.VERCEL) {
    return { ok: false, reason: 'read_only_env', file: filePath };
  }

  try {
    let current = '';
    try { current = fs.readFileSync(filePath, 'utf8'); } catch {}
    const map = new Map<string, string>();

    for (const line of current.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) map.set(m[1], m[2]);
    }

    for (const [k, v] of Object.entries(pairs)) {
      const serialized = /[\s"#]/.test(v) ? JSON.stringify(v) : v;
      map.set(k, serialized);
    }

    const out = Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
    fs.writeFileSync(filePath, out);
    return { ok: true, file: path.resolve(filePath) };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e), file: filePath };
  }
}

export const upsertEnvVars = upsertEnv;
