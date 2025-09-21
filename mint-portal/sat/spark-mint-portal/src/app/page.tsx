// src/app/page.tsx
'use client';
import { apiPath } from '@/lib/basePath';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import TokenProgress from '@/components/TokenProgress';
import { looksLikeSparkAddress, canonicalSparkAddress, reencodeSparkAddr } from '@/lib/validate';

type Lang = 'ENG' | 'ZH';

type Quote = {
  ok?: boolean;
  feeAddress: string;
  amount: string;
  since: number;
  receiver: string;
  tokenId?: string | null;
  payoutBase?: string | null;
  orderToken: string;
  suggestedTier?: 'FCFS' | 'PAID' | 'OG';
  tierLabel?: string;
  requiredAmountSats?: string;
  lastRound?: boolean;
  fcfs?: {
    available: boolean;
    alreadyClaimed: boolean;
    priceSats: string;
    limit: number;
    taken: number;
  };
  paid?: {
    cohortIndex: number | null;
    totalCohorts: number;
    priceSats: string | null;
    mintedCount: number;
    sizes: number[];
  };
  note?: string;
  error?: string;
};

type HolderQuote = {
  ok?: boolean;
  receiver: string;
  eligible: boolean;
  claimed: boolean;
  matchedIds?: string[];
  matchedTickers?: string[];
  tokenIds?: string[];
  orderToken?: string;
  error?: string;
};

const T = {
  ENG: {
    title: 'Mint BTKN (Spark)',
    intro:
      'Enter your sp1/spark1 → Generate → (if FCFS/Paid) send sats → paste Tx Hash → Verify. Tokens will be minted to the payer address.',
    step1: '1) Your Spark Address (for eligibility check)',
    ogToggle: 'Use OG claim (snapshot)',
    generate: 'Generate Mint Info',
    step2: '2) Mint',
    payTo: 'Send sats to',
    requiredAmount: 'Required amount',
    detectedTier: 'Detected tier',
    copyAddress: 'Copy Address',
    copyAmount: 'Copy Amount',
    openSparkScan: 'Open on SparkScan',
    openInWallet: 'Open in wallet',
    step3: '3) Transaction Hash',
    txHash: 'Tx hash',
    required: 'Required',
    txPlaceholder: 'txid…',
    step4: '4) Verify & Mint',
    verifyBtn: 'Verify Payment → Mint BTKN',
    verifying: 'Verifying…',
    rule: 'One tx hash equals one mint. Reuse is blocked.',
    resp: 'Response',
    errNeedSp1: 'Enter a valid sp1/spark1…',
    errNeedToken: 'Order token is not ready. Click Generate first.',
    errNeedTx: 'Tx hash is required',
    langENG: 'ENG',
    langZH: 'ZH',
    cooldownMsg: 'Cooling down… please wait.',
    cooldownBtn: (s: number) => `Cooling down… ${s}s`,
    rateLimited: 'Rate limited. Cooling down…',
    tooEarly: 'Too early. Cooling down…',
    fcfsClaimed:
      'You already claimed the Free Mint. You can continue with Paid Mint for more tokens.',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    holderTitle: 'Holder Claim',
    holderIntro:
      'If you hold eligible token(s), claim here (1x per address). No payment required.',
    holderInput: 'A) Holder Address',
    holderCheck: 'Check & Prepare Claim',
    holderStatus: 'Status',
    holderEligible: 'Eligible as holder',
    holderNotEligible: 'Not eligible as holder',
    holderClaimed: 'Already claimed',
    holderTokens: 'Eligible tokens',
    holderBtn: 'Claim Holder Mint',
    holderResp: 'Holder Response'
  },
  ZH: {
    title: '铸造 BTKN（Spark）',
    intro:
      '输入 sp1/spark1 → 生成 →（若 FCFS/付费）付款 → 粘贴交易哈希 → 验证。代币会铸到付款地址。',
    step1: '1) 你的 Spark 地址（用于资格检查）',
    ogToggle: '使用 OG 领取（快照）',
    generate: '生成铸造信息',
    step2: '2) 铸造',
    payTo: '支付至',
    requiredAmount: '所需金额',
    detectedTier: '检测到的档位',
    copyAddress: '复制地址',
    copyAmount: '复制金额',
    openSparkScan: '在 SparkScan 打开',
    openInWallet: '在钱包中打开',
    step3: '3) 交易哈希',
    txHash: '交易哈希',
    required: '必填',
    txPlaceholder: '交易哈希…',
    step4: '4) 验证并铸造',
    verifyBtn: '验证 → 铸造 BTKN',
    verifying: '验证中…',
    rule: '一笔交易哈希 = 一次铸币。相同哈希不能重复使用。',
    resp: '响应',
    errNeedSp1: '请输入有效的 sp1/spark1…',
    errNeedToken: '订单令牌尚未就绪，请先点击生成。',
    errNeedTx: '必须填写交易哈希',
    langENG: 'ENG',
    langZH: 'ZH',
    cooldownMsg: '冷却中…',
    cooldownBtn: (s: number) => `冷却中… ${s} 秒`,
    rateLimited: '已限流',
    tooEarly: '过早请求',
    fcfsClaimed: '你已领取免费铸造，可继续付费铸造。',
    copied: '已复制',
    copyFailed: '复制失败',
    holderTitle: '持有者领取',
    holderIntro:
      '如持有符合条件的代币，在此领取（每地址 1 次），无需支付。',
    holderInput: 'A) 持有者地址',
    holderCheck: '检查并准备领取',
    holderStatus: '状态',
    holderEligible: '符合资格',
    holderNotEligible: '不符合资格',
    holderClaimed: '已领取',
    holderTokens: '符合条件的代币',
    holderBtn: '领取持有者空投',
    holderResp: '持有者响应'
  }
} as const;

const TOKEN_DEC = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS ?? '6');
const TOKEN_TICKER = String(process.env.NEXT_PUBLIC_TOKEN_TICKER ?? 'TOKEN');

function baseToTokenStr(base: string | number | bigint) {
  try {
    const n = BigInt(String(base));
    const d = BigInt(TOKEN_DEC);
    const pow = 10n ** d;
    const whole = n / pow;
    const frac = (n % pow)
      .toString()
      .padStart(TOKEN_DEC, '0')
      .replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : `${whole}`;
  } catch {
    return String(base);
  }
}

function fmtSats(s: string | number | undefined | null) {
  if (s === null || s === undefined) return '';
  return String(s) + ' sats';
}

function summarizeError(j: any): string {
  if (!j) return 'Error: unknown';
  const e = String(j.error || 'unknown');
  const lines: string[] = [];
  if (e === 'rate_limited') {
    lines.push('Error: Rate limited (API throttled).');
    if (j.retryAfterMs)
      lines.push(`Retry after ~${Math.ceil(Number(j.retryAfterMs) / 1000)}s`);
  } else if (e === 'too_early') {
    lines.push('Error: Too early, tx not ready on explorer.');
    if (j.retryAfterMs)
      lines.push(`Retry after ~${Math.ceil(Number(j.retryAfterMs) / 1000)}s`);
  } else if (e === 'tx_already_used') {
    lines.push('Error: Tx hash already used.');
  } else if (e === 'og_not_eligible') {
    lines.push('OG: not eligible (need tx before snapshot).');
    if (j.cutoffMs)
      lines.push(`Cutoff: ${new Date(Number(j.cutoffMs)).toISOString()}`);
  } else if (e === 'og_tx_invalid') {
    lines.push('OG: tx invalid / cannot parse sender.');
  } else if (e === 'holder_already_claimed') {
    lines.push('Holder: already claimed.');
  } else if (e === 'fcfs_sold_out') {
    lines.push('FCFS: sold out.');
  } else if (e.startsWith('api_error')) {
    lines.push(`Explorer API error.`);
  } else {
    lines.push(`Error: ${e}`);
  }
  return lines.join('\n');
}

function summarizeQuote(j: any): string {
  if (!j || j.ok === false) return summarizeError(j);
  const lines: string[] = [];
  if (j.suggestedTier)
    lines.push(
      `Tier: ${j.suggestedTier}${j.tierLabel ? ` (${j.tierLabel})` : ''}`
    );
  if (j.fcfs) {
    lines.push(
      `FCFS: ${j.fcfs.available ? 'available' : 'sold out'}${
        j.fcfs.alreadyClaimed ? ' • already claimed' : ''
      } • ${j.fcfs.taken}/${j.fcfs.limit}`
    );
  }
  if (j.paid) {
    const tier = j.paid.cohortIndex
      ? `Tier ${j.paid.cohortIndex}/${j.paid.totalCohorts}`
      : '—';
    const price = j.paid.priceSats ? fmtSats(j.paid.priceSats) : '';
    lines.push(`Paid: ${tier}${price ? ` • ${price}` : ''} • minted ${j.paid.mintedCount}`);
  }
  if (j.feeAddress) lines.push(`Pay to: ${canonicalSparkAddress(j.feeAddress)}`);
  if (j.requiredAmountSats || j.amount)
    lines.push(`Amount: ${fmtSats(j.requiredAmountSats || j.amount)}`);
  return lines.join('\n');
}

function summarizeVerify(j: any): string {
  if (!j || j.ok === false) return summarizeError(j);
  const lines: string[] = [];
  if (j.minted === true) {
    lines.push(`Minted ✓ (${j.tier ?? '—'})`);
    if (j.mintReceiver) lines.push(`Receiver: ${j.mintReceiver}`);
    if (j.cohort?.index)
      lines.push(
        `Cohort: Tier ${j.cohort.index}${
          j.cohort.slot ? ` • Slot ${j.cohort.slot}` : ''
        }`
      );
    if (j.payoutBaseUnits) {
      const pretty = baseToTokenStr(j.payoutBaseUnits);
      lines.push(`Payout: ${pretty} ${TOKEN_TICKER}`);
    }
    if (j.mintTxId) lines.push(`MintTx: ${j.mintTxId}`);
    if (j.transferTxId) lines.push(`XferTx: ${j.transferTxId}`);
  } else {
    if (j.tier) lines.push(`Tier: ${j.tier}`);
    lines.push('Mint not executed');
    if (j.reason) lines.push(`Reason: ${j.reason}`);
    if (j.errorMint) lines.push(`MintError: ${j.errorMint}`);
  }
  return lines.join('\n');
}

function summarizeHolder(j: any): string {
  if (!j || j.ok === false) return summarizeError(j);
  const lines: string[] = [];
  lines.push(`Address: ${j.receiver}`);
  lines.push(
    `Status: ${j.claimed ? 'Already claimed' : j.eligible ? 'Eligible' : 'Not eligible'}`
  );
  if (j.matchedIds?.length) lines.push(`IDs: ${j.matchedIds.join(', ')}`);
  if (j.matchedTickers?.length)
    lines.push(`Tickers: ${j.matchedTickers.join(', ')}`);
  if (!j.matchedIds?.length && j.tokenIds?.length)
    lines.push(`IDs: ${j.tokenIds.join(', ')}`);
  return lines.join('\n');
}

const GENERATE_COOLDOWN_MS = Number(process.env.NEXT_PUBLIC_GENERATE_COOLDOWN_MS ?? '1200');
const VERIFY_COOLDOWN_MS = Number(process.env.NEXT_PUBLIC_VERIFY_COOLDOWN_MS ?? '60000');

const SATS_PER_BTC = 100_000_000n;
function satsToBtcStr(satsStr: string) {
  try {
    const n = BigInt(String(satsStr || '0'));
    const whole = n / SATS_PER_BTC;
    const frac = n % SATS_PER_BTC;
    const fracStr = frac
      .toString()
      .padStart(8, '0')
      .replace(/0+$/, '');
    return fracStr.length ? `${whole}.${fracStr}` : `${whole}`;
  } catch {
    return '0';
  }
}
function bip21(addr: string, sats: string) {
  const btc = satsToBtcStr(sats);
  return `bitcoin:${addr}?amount=${btc}`;
}

function buildTierLabel(q: Quote | null): string {
  if (!q) return '';
  if (q.tierLabel) return q.tierLabel;
  if (q.suggestedTier === 'OG') return 'OG Snapshot';
  if (q.suggestedTier === 'PAID') {
    if (q.paid?.cohortIndex) {
      const last = !!q.lastRound || q.paid?.cohortIndex === q.paid?.totalCohorts;
      return `Paid Mint — Tier ${q.paid.cohortIndex}${last ? ' (Last Round)' : ''}`;
    }
    return 'Paid Mint';
  }
  return 'FCFS Tier Free';
}

export default function Page() {
  const [lang, setLang] = useState<Lang>('ENG');
  const t = T[lang];

  const [receiver, setReceiver] = useState('');
  const [useOG, setUseOG] = useState(false); 
  const [txId, setTxId] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [qr, setQr] = useState<string>('');
  const [log, setLog] = useState('');
  const [toast, setToast] = useState('');

  const [ogToken, setOgToken] = useState<string | null>(null);

  const [verifying, setVerifying] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const inCooldown = !!cooldownUntil && cooldownUntil > Date.now();
  const cooldownLeftSec = inCooldown
    ? Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
    : 0;

  const [holderAddr, setHolderAddr] = useState('');
  const [holderInfo, setHolderInfo] = useState<HolderQuote | null>(null);
  const [holderLog, setHolderLog] = useState('');
  const [holderBusy, setHolderBusy] = useState(false);

  useEffect(() => {
    if (cooldownUntil === null) return;
    const id = setInterval(() => {
      if (cooldownUntil <= Date.now()) setCooldownUntil(null);
    }, 250);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  function startCooldown(ms: number) {
    const dur = Math.max(0, Number(ms) || 0);
    if (dur <= 0) {
      setCooldownUntil(null);
      return;
    }
    setCooldownUntil(Date.now() + dur);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast(t.copied);
      setTimeout(() => setToast(''), 1200);
    } catch {
      setToast(t.copyFailed);
      setTimeout(() => setToast(''), 1200);
    }
  }

  async function safeJsonResponse(r: Response) {
    const txt = await r.text();
    try {
      return JSON.parse(txt);
    } catch {
      return { ok: false, error: 'bad_json', raw: txt };
    }
  }

  async function requestQuote() {
    setLog('');
    setOgToken(null);
    if (inCooldown) {
      setLog('Cooling down…');
      return;
    }
    if (!looksLikeSparkAddress(receiver)) {
      setLog(t.errNeedSp1);
      return;
    }
    startCooldown(GENERATE_COOLDOWN_MS);
    try {
      const receiverNorm = canonicalSparkAddress(receiver);

      if (useOG) {
        const r = await fetch(apiPath('/api/og/request'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ receiverSparkAddress: receiverNorm }),
          cache: 'no-store'
        });
        const j = await safeJsonResponse(r);
        if (!r.ok || !j?.ok) {
          setQuote(null);
          setLog(summarizeError(j));
          return;
        }
        setOgToken(j.orderToken);
        const pseudo: Quote = {
          ok: true,
          feeAddress: '',
          amount: '0',
          since: j.since || Date.now(),
          receiver: receiverNorm,
          orderToken: j.orderToken,
          suggestedTier: 'OG',
          tierLabel: 'OG Snapshot',
          requiredAmountSats: '0',
          note: 'OG mode: no payment needed'
        };
        setQuote(pseudo);
        setLog('OG token prepared. Paste your OG tx hash and click Verify.');
        return;
      }

      const r = await fetch(apiPath('/api/paymint/request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverSparkAddress: receiverNorm }),
        cache: 'no-store'
      });
      const j = await safeJsonResponse(r);
      if (!r.ok) {
        setQuote(null);
        setLog(summarizeError(j));
        return;
      }
      setQuote(j);

      let holderLine = '';
      try {
        const hr = await fetch(apiPath('/api/holder/request'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ receiverSparkAddress: receiverNorm }),
          cache: 'no-store'
        });
        const hj = await safeJsonResponse(hr);
        holderLine = hr.ok
          ? `Holder: ${hj.claimed ? 'already claimed' : hj.eligible ? 'eligible' : 'not eligible'}`
          : summarizeError(hj);
      } catch {}
      const lines = [summarizeQuote(j), holderLine].filter(Boolean);
      setLog(lines.join('\n'));

      if (j?.fcfs?.alreadyClaimed) {
        setToast(t.fcfsClaimed);
        setTimeout(() => setToast(''), 3000);
      }
    } catch (e: any) {
      setQuote(null);
      setLog(
        summarizeError({ error: 'network_error', detail: String(e?.message || e) })
      );
    }
  }

  useEffect(() => {
    (async () => {
      if (!quote) {
        setQr('');
        return;
      }
      if (quote.suggestedTier === 'OG' || !quote.feeAddress) {
        setQr('');
        return;
      }
      const amt = String(quote.requiredAmountSats || quote.amount || '0');
      try {
        const feeAddrShown = canonicalSparkAddress(quote.feeAddress);
        const uri = bip21(feeAddrShown, amt);
        setQr(await QRCode.toDataURL(uri));
      } catch {
        try {
          setQr(await QRCode.toDataURL(canonicalSparkAddress(quote.feeAddress)));
        } catch {
          setQr('');
        }
      }
    })();
  }, [quote]);

  async function verifyAndSend() {
    setLog('');
    if (inCooldown) {
      setLog('Cooling down…');
      return;
    }
    if (!quote?.orderToken) {
      setLog(t.errNeedToken);
      return;
    }
    if (!txId.trim()) {
      setLog(t.errNeedTx);
      return;
    }
    setVerifying(true);
    startCooldown(VERIFY_COOLDOWN_MS);
    try {
      if (quote.suggestedTier === 'OG') {

        const r = await fetch(apiPath('/api/og/verify'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: ogToken || quote.orderToken, txId: txId.trim() }),
          cache: 'no-store'
        });
        const j = await safeJsonResponse(r);
        setLog(r.ok ? summarizeVerify(j) : summarizeError(j));
      } else {
        const r = await fetch(apiPath('/api/paymint/verify'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: quote.orderToken, txId: txId.trim() }),
          cache: 'no-store'
        });
        const j = await safeJsonResponse(r);
        setLog(r.ok ? summarizeVerify(j) : summarizeError(j));
      }
    } catch (e: any) {
      setLog(
        summarizeError({ error: 'network_error', detail: String(e?.message || e) })
      );
    }
    setVerifying(false);
  }

  async function checkHolder() {
    setHolderLog('');
    setHolderInfo(null);
    if (!looksLikeSparkAddress(holderAddr)) {
      setHolderLog(t.errNeedSp1);
      return;
    }
    setHolderBusy(true);
    try {
      const holderNorm = canonicalSparkAddress(holderAddr);
      const r = await fetch(apiPath('/api/holder/request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverSparkAddress: holderNorm }),
        cache: 'no-store'
      });
      const j = await safeJsonResponse(r);
      setHolderLog(r.ok ? summarizeHolder(j) : summarizeError(j));
      if (r.ok && j?.ok) setHolderInfo(j);
    } catch (e: any) {
      setHolderLog(
        summarizeError({ error: 'network_error', detail: String(e?.message || e) })
      );
    }
    setHolderBusy(false);
  }

  async function claimHolder() {
    if (!holderInfo?.orderToken) {
      setHolderLog('missing holder token');
      return;
    }
    setHolderBusy(true);
    try {
      const r = await fetch(apiPath('/api/holder/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: holderInfo.orderToken }),
        cache: 'no-store'
      });
      const j = await safeJsonResponse(r);
      setHolderLog(r.ok ? summarizeHolder(j) : summarizeError(j));
    } catch (e: any) {
      setHolderLog(
        summarizeError({ error: 'network_error', detail: String(e?.message || e) })
      );
    }
    setHolderBusy(false);
  }

  const canVerify = !!quote?.orderToken && !!txId.trim() && !verifying && !inCooldown;
  const canGenerate = !verifying && !inCooldown;
  const tierLine = buildTierLabel(quote);
  const shownAmount = String(quote?.requiredAmountSats || quote?.amount || '');

  const holderStatusText = holderInfo?.claimed
    ? T[lang].holderClaimed
    : holderInfo?.eligible
    ? T[lang].holderEligible
    : T[lang].holderNotEligible;

  const isOG = quote?.suggestedTier === 'OG';

  const feeAddrSp1 = quote?.feeAddress ? canonicalSparkAddress(quote.feeAddress) : '';
  const feeAddrSpark1 = feeAddrSp1
    ? (() => {
        try { return reencodeSparkAddr(feeAddrSp1, 'spark'); }
        catch { return feeAddrSp1.replace(/^sp/, 'spark'); }
      })()
    : '';

  return (
    <main className="space-y-6">
      <TokenProgress />

      <div className="flex items-center justify-end gap-2">
        <button
          className={`btn ${lang === 'ENG' ? 'bg-white/20' : ''}`}
          onClick={() => setLang('ENG')}
          aria-pressed={lang === 'ENG'}
        >
          {T.ENG.langENG}
        </button>
        <button
          className={`btn ${lang === 'ZH' ? 'bg-white/20' : ''}`}
          onClick={() => setLang('ZH')}
          aria-pressed={lang === 'ZH'}
        >
          {T.ZH.langZH}
        </button>
      </div>

      <h1 className="h1">{t.title}</h1>
      <p className="text-sm text-neutral-300">{t.intro}</p>

      {toast && <div className="card text-sm">{toast}</div>}
      {inCooldown && (
        <div className="card text-sm">
          {t.cooldownMsg} ({cooldownLeftSec}s)
        </div>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">{t.step1}</h2>
        <input
          className="input"
          placeholder="sp1 / spark1…"
          value={receiver}
          onChange={(e) => setReceiver(e.target.value)}
          disabled={inCooldown}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useOG}
            onChange={(e) => setUseOG(e.target.checked)}
          />
          {t.ogToggle}
        </label>
        <button className="btn" onClick={requestQuote} disabled={!canGenerate}>
          {inCooldown ? T[lang].cooldownBtn(cooldownLeftSec) : t.generate}
        </button>
      </section>

      {quote && (
        <section className="card space-y-3">
          <h2 className="font-semibold">{t.step2}</h2>
          {isOG ? (
            <div className="text-sm">
              <div>
                OG mode: No payment needed. Just provide an OG tx hash from your
                address in Step 3.
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm">{t.payTo}</div>

              
                <div className="text-[11px] uppercase opacity-70 mt-1">sp1 (canonical)</div>
                <div className="text-xs break-all">
                  <code>{feeAddrSp1}</code>
                </div>
               <div className="mt-2">
            <button
               className="btn btn-sm"
                onClick={() => copy(feeAddrSp1)}
               disabled={inCooldown}
            >
               {lang === 'ZH' ? '复制 sp1 地址' : 'Copy sp1 address'}
          </button>
               </div>

                {/* spark1 for explorer visual */}
                <div className="text-[11px] uppercase opacity-70 mt-3">spark1 (explorer)</div>
                <div className="text-xs break-all">
                  <code>{feeAddrSpark1}</code>
                </div>
                <div className="mt-2">
                  <button
                   className="btn btn-sm"
                   onClick={() => copy(feeAddrSpark1)}
                   disabled={inCooldown}
                 >
                  {lang === 'ZH' ? '复制 spark1 地址' : 'Copy spark1 address'}
                   </button>
                   </div>

                {/* Amount */}
                <div className="mt-3 text-sm">{t.requiredAmount}</div>
                <div className="text-xs">
                  <code>{shownAmount}</code> sats
                  <span className="opacity-70"> (~{satsToBtcStr(shownAmount)} BTC)</span>
                </div>
                <div className="mt-1 text-[11px] opacity-80">
                  <button
                    className="underline hover:opacity-100"
                    onClick={() => copy(shownAmount)}
                    disabled={inCooldown}
                  >
                    {lang === 'ZH' ? '复制金额' : 'copy amount'}
                  </button>
                </div>

                {/* Tier */}
                <div className="mt-3 text-sm">{t.detectedTier}</div>
                <div className="text-xs">{tierLine}</div>

                {quote.fcfs && (
                  <div className="mt-2 text-xs opacity-80">
                    FCFS: price {quote.fcfs.priceSats} sats • {quote.fcfs.taken}/{quote.fcfs.limit} claimed
                    {quote.fcfs.alreadyClaimed ? ' • already claimed' : ''}
                  </div>
                )}
                {quote.paid && (
                  <div className="mt-1 text-xs opacity-80">
                    Paid: {quote.paid.cohortIndex ? `Tier ${quote.paid.cohortIndex}` : '—'} / {quote.paid.totalCohorts}
                    {quote.paid.priceSats ? ` • price ${quote.paid.priceSats} sats` : ''} • minted {quote.paid.mintedCount}
                  </div>
                )}

                {/* Actions (compact) */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    className="btn"
                    onClick={() =>
                      window.open(
                        'https://www.sparkscan.io/address/' + feeAddrSp1,
                        '_blank'
                      )
                    }
                  >
                    {t.openSparkScan}
                  </button>
                  <button
                    className="btn"
                    onClick={() =>
                      window.open(
                        bip21(feeAddrSp1, shownAmount),
                        '_blank'
                      )
                    }
                  >
                    {t.openInWallet}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-center">
                {qr && (
                  <img
                    src={qr}
                    alt="qr"
                    className="rounded-xl border border-white/10"
                  />
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {quote && (
        <section className="card space-y-3">
          <h2 className="font-semibold">{t.step3}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">{isOG ? 'OG Tx hash' : t.txHash}</label>
              <input
                className="input"
                placeholder={t.txPlaceholder}
                value={txId}
                onChange={(e) => setTxId(e.target.value)}
                disabled={inCooldown}
              />
              <p className="text-xs text-neutral-400 mt-1">{t.required}</p>
            </div>
          </div>
        </section>
      )}

      {quote && (
        <section className="card space-y-3">
          <h2 className="font-semibold">{t.step4}</h2>
          <button className="btn" onClick={verifyAndSend} disabled={!canVerify}>
            {inCooldown
              ? T[lang].cooldownBtn(cooldownLeftSec)
              : verifying
              ? t.verifying
              : isOG
              ? 'Verify OG → Mint'
              : t.verifyBtn}
          </button>
          <p className="text-xs text-neutral-400">{t.rule}</p>
        </section>
      )}

      <section className="card">
        <h3 className="font-semibold mb-2">{t.resp}</h3>
        <pre className="text-xs whitespace-pre-wrap">{log}</pre>
      </section>

      {/* HOLDER SECTION */}
      <section className="card space-y-3">
        <h2 className="font-semibold">{t.holderTitle}</h2>
        <p className="text-sm text-neutral-300">{t.holderIntro}</p>
        <label className="label">{t.holderInput}</label>
        <input
          className="input"
          placeholder="sp1 / spark1…"
          value={holderAddr}
          onChange={(e) => setHolderAddr(e.target.value)}
        />
        <div className="flex gap-2">
          <button className="btn" onClick={checkHolder} disabled={holderBusy}>
            {t.holderCheck}
          </button>
          <button
            className="btn"
            onClick={claimHolder}
            disabled={
              holderBusy || !holderInfo?.ok || !holderInfo.eligible || holderInfo.claimed
            }
          >
            {t.holderBtn}
          </button>
        </div>

        {holderInfo && (
          <div className="mt-3 space-y-1 text-sm">
            <div>
              Address{' '}
              <span className="font-mono break-all">{holderInfo.receiver}</span>
            </div>
            <div>
              {t.holderStatus}:{' '}
              {holderStatusText}
            </div>
            <div className="mt-1">{t.holderTokens}:</div>
            <div className="text-xs font-mono break-all rounded bg-white/5 p-2 space-y-1">
              {((holderInfo?.matchedIds && holderInfo.matchedIds.length) ||
                (holderInfo?.matchedTickers && holderInfo.matchedTickers.length) ||
                (holderInfo?.tokenIds && holderInfo.tokenIds.length)) ? (
                <>
                  {holderInfo?.matchedIds?.length ? (
                    <div>IDs: {holderInfo.matchedIds.join(', ')}</div>
                  ) : null}
                  {holderInfo?.matchedTickers?.length ? (
                    <div>Tickers: {holderInfo.matchedTickers.join(', ')}</div>
                  ) : null}
                  {!holderInfo?.matchedIds?.length && holderInfo?.tokenIds?.length ? (
                    <div>IDs: {holderInfo.tokenIds.join(', ')}</div>
                  ) : null}
                </>
              ) : (
                <>—</>
              )}
            </div>
          </div>
        )}

        <div className="mt-3">
          <h3 className="font-semibold mb-2">{t.holderResp}</h3>
          <pre className="text-xs whitespace-pre-wrap">{holderLog}</pre>
        </div>
      </section>
    </main>
  );
}
