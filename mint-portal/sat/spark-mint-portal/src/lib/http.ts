type RetryOpts = { retries?: number; backoffMs?: number; headers?: Record<string,string> };

export async function fetchTextWithRetry(url: string, opts: RetryOpts = {}): Promise<string> {
  const { retries = 4, backoffMs = 500, headers = {} } = opts;
  let lastErr: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { cache: "no-store", headers: { "user-agent": "PayMintBot/1.0", ...headers } });
    if (res.ok) return await res.text();
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`sparkscan ${res.status}`);
      const wait = backoffMs * Math.pow(2, attempt) + Math.floor(Math.random()*300);
      await new Promise(r=>setTimeout(r,wait)); continue;
    }
    throw new Error(`sparkscan ${res.status}`);
  }
  throw lastErr || new Error("sparkscan unknown");
}

export async function fetchJsonWithRetry<T=any>(url: string, opts: RetryOpts = {}): Promise<T> {
  const { retries = 4, backoffMs = 500, headers = {} } = opts;
  let lastErr: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { cache: "no-store", headers: { "user-agent": "PayMintBot/1.0", accept: "application/json", ...headers } });
    if (res.ok) return await res.json();
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`sparkscan ${res.status}`);
      const wait = backoffMs * Math.pow(2, attempt) + Math.floor(Math.random()*300);
      await new Promise(r=>setTimeout(r,wait)); continue;
    }
    throw new Error(`sparkscan ${res.status}`);
  }
  throw lastErr || new Error("sparkscan unknown");
}
