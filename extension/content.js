/**
 * Avalisa PO Bot v2 — Content Script
 * Injected into pocketoption.com and po.cash
 * Uses DOM-click approach for maximum stability.
 */

const API_BASE = 'https://avalisa-backend.onrender.com';
const AFFILIATE_LINK = 'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';
const DASHBOARD_URL = 'https://avalisabot.vercel.app';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  running: false,
  isTradeOpen: false,
  currentAmount: 0,
  martingaleStep: 0,
  tradesCount: 0,
  lastDirection: null,
  licenseInfo: null,
  settings: null,
  jwt: null,
  userId: null,
  deviceFingerprint: null,
  stopRequested: false,
  cycleGeneration: 0,  // incremented on each start/stop; stale cycles self-terminate
  affiliateLink: AFFILIATE_LINK,  // updated from DB on startup
  // AI assist (background, non-blocking)
  candleBuffer: {},   // { "EURUSD_otc:60": [{time,open,high,low,close},...] }
  activePair: null,   // normalized asset key from last updateHistoryNewFast
  activePeriod: null, // period (seconds) from last updateHistoryNewFast
  aiTokensRemaining: null,
  aiTokensLimit: null,
  aiUnlimited: false,
  recentCloseEvents: [], // [{ ts, event, payload }]
  // Payout monitor (populated from chrome.storage.local)
  payoutMinPercent: 90,
  payoutAction: 'stop',
};

// ─── WebSocket Candle Interceptor ─────────────────────────────────────────────
// injected.js is now loaded directly by Chrome as a MAIN-world content script
// (see manifest.json content_scripts[0]). The legacy <script src=...> approach
// was blocked by PO's CSP, which prevented the WebSocket wrapper from installing.

const TF_TO_SECONDS = { S30: 30, M1: 60, M3: 180, M5: 300, M30: 1800, H1: 3600 };

let _wsDebugCount = 0;
let _tickLogCount = 0;
function parseWsMessage(raw) {
  if (typeof raw !== 'string') return;

  // Debug: log first 10 raw WS messages so we can see the actual format
  if (_wsDebugCount < 10) {
    console.log('[Avalisa] WS raw msg #' + _wsDebugCount + ':', raw.substring(0, 200));
    _wsDebugCount++;
  }

  // Socket.IO binary event placeholder (451- prefix)
  if (raw.startsWith('451-') || raw.startsWith('452-')) {
    console.log('[Avalisa] Socket.IO binary placeholder:', raw.substring(0, 200));
    return; // actual data arrives in next binary frame, handled by AVALISA_WS_HISTORY
  }

  // Socket.IO messages: 42["event", payload]
  const m = raw.match(/^42\["([^"]+)",([\s\S]+)\]$/);
  if (!m) return;
  const event = m[1];
  let payload;
  try { payload = JSON.parse(m[2]); } catch { return; }

  // Capture close-like events for trade result detection
  const CLOSE_EVENT_PATTERNS = /close|deal.*end|order.*close|profit|expir|update.*deal|success.*close/i;
  if (CLOSE_EVENT_PATTERNS.test(event)) {
    state.recentCloseEvents.push({ ts: Date.now(), event, payload });
    if (state.recentCloseEvents.length > 20) state.recentCloseEvents.shift();
    console.log('[Avalisa] CLOSE EVENT CAPTURED:', event, JSON.stringify(payload).substring(0, 500));
  }

  // Log ALL events — helps map PO's AI signal event names
  const skip = new Set(['updateStream', 'setTime', 'ping', 'pong']);
  if (!skip.has(event)) {
    console.log('[Avalisa] WS EVENT:', event, JSON.stringify(payload).substring(0, 400));
  }

  if (event === 'updateHistoryNewFast' || event === 'successloadHistory') {
    console.log('[Avalisa] History text frame:', event, JSON.stringify(payload).substring(0, 200));
  }
}

function ingestCandle(c) {
  if (!c || !c.asset || !c.period || !c.time) return;
  const key = `${c.asset}:${c.period}`;
  if (!state.candleBuffer[key]) state.candleBuffer[key] = [];
  const buf = state.candleBuffer[key];
  // Deduplicate by time
  const existing = buf.findIndex(x => x.time === c.time);
  const entry = { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
  if (existing >= 0) {
    buf[existing] = entry; // update (candle still forming)
  } else {
    buf.push(entry);
    if (buf.length > 50) buf.shift(); // keep last 50
  }
}

// Build OHLCV candles from raw ticks (asset, unix_ts_float, price)
function ingestTick(asset, timestamp, price) {
  if (!asset || !timestamp || !price) return;
  const periods = [30, 60, 180, 300, 1800, 3600];
  periods.forEach(period => {
    const key = `${asset}:${period}`;
    const candleTime = Math.floor(timestamp / period) * period;
    if (!state.candleBuffer[key]) state.candleBuffer[key] = [];
    const buf = state.candleBuffer[key];
    const last = buf[buf.length - 1];
    if (last && last.time === candleTime) {
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      last.close = price;
    } else {
      buf.push({ time: candleTime, open: price, high: price, low: price, close: price });
      if (buf.length > 50) buf.shift();
    }
  });
}

function normalizeAssetName(name) {
  // Convert DOM display name to WS asset key format
  // "AED/CNY OTC" → "AEDCNY_otc"
  // "EUR/USD OTC" → "EURUSD_otc"
  // "EUR/USD"     → "EURUSD"
  if (!name) return name;
  return name
    .replace(/\s+OTC$/i, '_otc')
    .replace(/\//g, '')
    .trim();
}

function getBufferedCandles() {
  // Single source of truth: the active pair/period tracked from the last
  // updateHistoryNewFast seed. Stale fuzzy fallbacks removed — they were
  // returning cross-pair data and causing the 50/25 mismatch.
  if (!state.activePair || !state.activePeriod) return [];
  const key = `${state.activePair}:${state.activePeriod}`;
  return state.candleBuffer[key] || [];
}

const MAX_CANDLE_BUFFER = 50;
const REQUIRED_CANDLES = 30; // 20 for SMA/RSI + 10 for slope window

// Merge-seed the buffer from a bulk updateHistoryNewFast payload.
// `ticks` is an array of [timestamp_seconds_float, price_float].
// v2.3.1: MERGE existing + incoming candles by time key, NEVER shrink the buffer.
// PO sometimes re-fires updateHistoryNewFast with fewer ticks (tab refocus, chart
// re-render). Old replace-seed logic clobbered larger buffers down to smaller ones.
function seedCandleBufferFromHistory(asset, period, ticks) {
  const key = `${asset}:${period}`;
  // Start from existing buffer (preserves real-time tick data and prior history)
  const byTime = new Map();
  const existing = state.candleBuffer[key] || [];
  for (const c of existing) {
    if (c && Number.isFinite(c.time)) byTime.set(c.time, { ...c });
  }

  for (const t of ticks) {
    if (!Array.isArray(t) || t.length < 2) continue;
    const tsRaw = Number(t[0]);
    const price = Number(t[1]);
    if (!Number.isFinite(tsRaw) || !Number.isFinite(price)) continue;
    const ts = tsRaw > 1e10 ? tsRaw / 1000 : tsRaw; // normalize ms → sec
    const candleTime = Math.floor(ts / period) * period;
    const cur = byTime.get(candleTime);
    if (cur) {
      // Update existing bucket: extend high/low, update close (last tick wins)
      cur.high = Math.max(cur.high, price);
      cur.low = Math.min(cur.low, price);
      cur.close = price;
    } else {
      byTime.set(candleTime, { time: candleTime, open: price, high: price, low: price, close: price });
    }
  }
  const candles = Array.from(byTime.values())
    .sort((a, b) => a.time - b.time)
    .slice(-MAX_CANDLE_BUFFER);
  state.candleBuffer[key] = candles;
  return candles.length;
}

// Pair switch: wipe every buffer except the newly active one.
function clearStalePairBuffers(keepAsset, keepPeriod) {
  const keepKey = `${keepAsset}:${keepPeriod}`;
  for (const key of Object.keys(state.candleBuffer)) {
    if (key !== keepKey) delete state.candleBuffer[key];
  }
}

// ─── Device Fingerprint ───────────────────────────────────────────────────────
function getDeviceFingerprint() {
  if (state.deviceFingerprint) return state.deviceFingerprint;
  const raw = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    navigator.hardwareConcurrency,
  ].join('|');
  // Simple hash
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  state.deviceFingerprint = Math.abs(hash).toString(36) + raw.length.toString(36);
  return state.deviceFingerprint;
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────
async function loadFromStorage() {
  return new Promise(resolve => {
    chrome.storage.local.get(['jwt', 'userId', 'settings', 'payoutMinPercent', 'payoutAction'], data => {
      state.jwt = data.jwt || null;
      state.userId = data.userId || null;
      state.settings = data.settings || getDefaultSettings();
      const minPct = Number(data.payoutMinPercent);
      state.payoutMinPercent = Number.isFinite(minPct) && minPct >= 1 && minPct <= 100 ? minPct : 90;
      state.payoutAction = ['stop', 'switch', 'keep'].includes(data.payoutAction) ? data.payoutAction : 'stop';
      resolve();
    });
  });
}

// Live-update payout monitor settings when any storage writer changes them.
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.payoutMinPercent) {
      const v = Number(changes.payoutMinPercent.newValue);
      if (Number.isFinite(v) && v >= 1 && v <= 100) {
        state.payoutMinPercent = v;
        const el = document.getElementById('av-payout-min');
        if (el && Number(el.value) !== v) el.value = v;
      }
    }
    if (changes.payoutAction && ['stop', 'switch', 'keep'].includes(changes.payoutAction.newValue)) {
      state.payoutAction = changes.payoutAction.newValue;
      const radio = document.querySelector(`input[name="av-payout-action"][value="${state.payoutAction}"]`);
      if (radio && !radio.checked) radio.checked = true;
    }
  });
}

async function saveSettings(settings) {
  state.settings = { ...state.settings, ...settings };
  return new Promise(resolve => {
    chrome.storage.local.set({ settings: state.settings }, resolve);
  });
}

function getDefaultSettings() {
  return {
    strategy: 'martingale',
    timeframe: 'M1',
    direction: 'alternating',
    martingaleMultiplier: 2.0,
    martingaleSteps: 'infinite',
    delaySeconds: 6,
    startAmount: 1.0,
    aiAssist: false,
    intensity: 'mid',
  };
}

// ─── API Helpers ──────────────────────────────────────────────────────────────
const FETCH_TIMEOUT_MS = 15000;

function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(tid));
}

async function apiPost(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.jwt) headers['Authorization'] = `Bearer ${state.jwt}`;
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function apiGet(path) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.jwt) headers['Authorization'] = `Bearer ${state.jwt}`;
  const res = await fetchWithTimeout(`${API_BASE}${path}`, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Retry wrapper — retries on network/timeout errors only (not 4xx responses)
async function withRetry(fn, maxAttempts = 3, delayMs = 10000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isNetworkErr = err instanceof TypeError || err.name === 'AbortError';
      if (!isNetworkErr || attempt === maxAttempts) {
        updateStatus('error', '❌ Server offline. Try again in 1 min.');
        throw err;
      }
      updateStatus('running', `⏳ Connecting to server... (${attempt}/${maxAttempts})`);
      await sleep(delayMs);
    }
  }
}

// ─── License Check ────────────────────────────────────────────────────────────
async function checkLicense() {
  try {
    const data = await withRetry(() => apiPost('/api/license/check', {
      userId: state.userId,
      deviceFingerprint: getDeviceFingerprint(),
    }));
    state.licenseInfo = data;
    return data;
  } catch (err) {
    console.error('[Avalisa] License check failed:', err);
    // On transient network failure, trust last-known-good cached license
    if (state.licenseInfo && state.licenseInfo.allowed) {
      return { ...state.licenseInfo, _networkError: true };
    }
    return { allowed: false, reason: 'Network error', _networkError: true };
  }
}

async function incrementTrade() {
  try {
    await apiPost('/api/license/increment', {
      userId: state.userId,
      deviceFingerprint: getDeviceFingerprint(),
    });
  } catch (err) {
    console.error('[Avalisa] Increment failed:', err);
  }
}

// ─── DOM Helpers ──────────────────────────────────────────────────────────────
async function getBalance() {
  const demo = isDemoMode();
  const selectors = demo
    ? ['.js-balance-demo', '.js-hd.js-balance-demo', '[class*="balance-demo"]', '.balance__value', '.header-balance']
    : ['.js-balance-real-USD', '.js-balance-real', '.js-hd.js-balance-real', '[class*="balance-real"]', '.balance__value', '.header-balance'];

  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.replace(/[^0-9.]/g, '');
        const val = parseFloat(text);
        if (val > 0) {
          console.log(`[Avalisa] Balance found via: ${sel} = ${val} (mode=${demo ? 'demo' : 'real'}, attempt=${attempt})`);
          return val;
        }
      }
    }
    if (attempt < 3) await sleep(300);
  }
  console.warn('[Avalisa] Balance not found after 3 attempts — mode:', demo ? 'demo' : 'real');
  return null;
}

function extractResultFromCloseEvent(payload) {
  if (!payload) return null;
  if (typeof payload.profit === 'number') {
    if (payload.profit === 0) return 'tie';
    return payload.profit > 0 ? 'win' : 'loss';
  }
  if (typeof payload.profitAmount === 'number') {
    if (payload.profitAmount === 0) return 'tie';
    return payload.profitAmount > 0 ? 'win' : 'loss';
  }
  if (payload.result === 'win' || payload.status === 'win') return 'win';
  if (payload.result === 'loss' || payload.status === 'loss' || payload.result === 'lose') return 'loss';
  if (payload.openPrice && payload.closePrice && payload.command !== undefined) {
    if (payload.closePrice === payload.openPrice) return 'tie';
    const up = payload.closePrice > payload.openPrice;
    const wasCall = payload.command === 0 || payload.direction === 'call' || payload.type === 'call';
    return (up === wasCall) ? 'win' : 'loss';
  }
  if (Array.isArray(payload) && payload.length > 0) {
    return extractResultFromCloseEvent(payload[payload.length - 1]);
  }
  if (Array.isArray(payload.deals) && payload.deals.length > 0) {
    return extractResultFromCloseEvent(payload.deals[payload.deals.length - 1]);
  }
  return null;
}

function getDealItems(limit = 5) {
  return Array.from(document.querySelectorAll('.deals-list__item')).slice(0, limit);
}

function getDealSignature(el) {
  if (!el) return null;
  const text = (el.innerText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return text || null;
}

function getLatestDealSignatures(limit = 5) {
  return getDealItems(limit)
    .map(getDealSignature)
    .filter(Boolean);
}

function readDealResult(el) {
  if (!el) return null;
  const payoutCell = el.querySelector('.item-row .centered');
  const text = (payoutCell?.innerText || el.innerText || '').trim();

  if (payoutCell?.classList.contains('price-up')) return 'win';
  if (payoutCell?.classList.contains('price-down')) return 'loss';
  if (/\+\s*\$/.test(text) || /\bwin\b/i.test(text)) return 'win';
  if (/\-\s*\$/.test(text) || /\bloss\b/i.test(text)) return 'loss';
  // $0 text with no +/- prefix is ambiguous (could be tie OR loss).
  // Return null and let WS/balance tier decide — WS is reliable for tie detection.
  if (/\$0(\.00)?$/.test(text) || text === '$0' || text === '$0.00') return null;
  return null;
}

function findResolvedNewDealResult(preTradeSignatures) {
  const previous = new Set(preTradeSignatures || []);
  for (const item of getDealItems(5)) {
    const sig = getDealSignature(item);
    if (!sig || previous.has(sig)) continue;
    const result = readDealResult(item);
    if (result) return { result, signature: sig };
  }
  return null;
}

function readWsTradeResultSince(tradeStartTs) {
  const recentWs = state.recentCloseEvents.filter(e => e.ts >= tradeStartTs);
  for (const ev of recentWs.slice().reverse()) {
    const result = extractResultFromCloseEvent(ev.payload);
    if (result) return { result, event: ev.event };
  }
  return null;
}

function classifyResultFromBalance(balanceBefore, balanceDuringTrade, balanceNow, amount, iteration) {
  if (balanceNow === null) return null;

  const settleTolerance = Math.max(0.15, amount * 0.15);
  const tieTolerance = Math.max(0.05, amount * 0.05); // ±5% of stake (balanceBefore tier — tight)
  const tieToleranceDuring = Math.max(0.10, amount * 0.10); // ±10% of stake (during tier — looser)

  if (balanceBefore !== null) {
    const deltaFromBefore = balanceNow - balanceBefore;

    // TIE: balance returned to pre-trade level (stake refunded, no profit/loss)
    if (iteration >= 4 && Math.abs(deltaFromBefore) <= tieTolerance) {
      return { result: 'tie', detail: `balance returned to pre-trade level (${deltaFromBefore.toFixed(2)})` };
    }

    if (deltaFromBefore > amount * 0.5) {
      return { result: 'win', detail: `balance vs before +${deltaFromBefore.toFixed(2)}` };
    }
    if (deltaFromBefore < -(amount * 0.5)) {
      return { result: 'loss', detail: `balance vs before ${deltaFromBefore.toFixed(2)}` };
    }
  }

  if (balanceDuringTrade !== null) {
    const deltaFromDuring = balanceNow - balanceDuringTrade;

    // TIE at this tier: stake was deducted at open and restored at close → delta ≈ +amount
    // MUST check before win branch or tie would be misread as win.
    if (iteration >= 4 && Math.abs(deltaFromDuring - amount) <= tieToleranceDuring) {
      return { result: 'tie', detail: `stake returned vs during (${deltaFromDuring.toFixed(2)} ≈ ${amount.toFixed(2)})` };
    }

    // WIN: stake + profit → delta > ~1.1x stake (excludes tie zone)
    if (deltaFromDuring > amount * 1.1) {
      return { result: 'win', detail: `balance vs during +${deltaFromDuring.toFixed(2)}` };
    }

    // LOSS: stake kept, balance didn't move from trade-open level
    if (iteration >= 6 && Math.abs(deltaFromDuring) <= settleTolerance) {
      return { result: 'loss', detail: `balance stayed near trade-open balance (${deltaFromDuring.toFixed(2)})` };
    }
  }

  return null;
}

async function resolveTradeResult(balanceBefore, balanceDuringTrade, amount, tradeStartTs, preTradeSignatures) {
  for (let i = 0; i < 24; i++) {
    const wsResult = readWsTradeResultSince(tradeStartTs);
    if (wsResult) {
      console.log('[Avalisa] RESULT:', wsResult.result.toUpperCase(), 'via WS event:', wsResult.event);
      return wsResult.result;
    }

    const domResult = findResolvedNewDealResult(preTradeSignatures);
    if (domResult) {
      console.log(`[Avalisa] RESULT: ${domResult.result.toUpperCase()} via DOM deal scrape (${domResult.signature})`);
      return domResult.result;
    }

    const balanceNow = await getBalance();
    const balanceResult = classifyResultFromBalance(balanceBefore, balanceDuringTrade, balanceNow, amount, i);
    if (balanceResult) {
      console.log(`[Avalisa] RESULT: ${balanceResult.result.toUpperCase()} via ${balanceResult.detail}`);
      return balanceResult.result;
    }

    await sleep(500);
  }

  // Inconclusive after waiting through WS + DOM + balance settling.
  // Default TIE is safest: holds current stake, repeats trade, doesn't advance or reset martingale.
  // Better to under-bet a real loss than to ladder up on a real win or wipe recovery on a real loss.
  console.warn('[Avalisa] RESULT: TIE (inconclusive after all tiers — holding stake)');
  return 'tie';
}

function setTradeAmount(amount) {
  // DOM-confirmed selector order (from DevTools inspection of PO's live DOM):
  // The real trade amount input is: .block--bet-amount .value__val input
  // It has NO name/class attributes — just type="text" autocomplete="off".
  // input[name="amount"] matches a DIFFERENT hidden input and must NOT be used first.
  const selectors = [
    '.block--bet-amount .value__val input',
    '.value__val input',
    'input[data-testid="trade-amount"]',
    '.trade-amount input',
    'input[name="amount"]',
  ];

  let input = null;
  let matchedSelector = null;
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    // Skip any input that belongs to our own overlay
    if (el && !el.closest('#avalisa-overlay') && !el.closest('#avalisa-panel')) {
      input = el;
      matchedSelector = sel;
      break;
    }
  }

  if (!input) {
    console.warn('[Avalisa] setTradeAmount: no input found. Tried:', selectors);
    return false;
  }

  const valueStr = amount.toFixed(2);
  console.log('[Avalisa] setTradeAmount: using selector:', matchedSelector, '| setting amount:', valueStr);

  // Focus and select-all so execCommand replaces the full existing value
  input.focus();
  input.select();

  // execCommand simulates real user typing — React picks this up reliably
  const typed = document.execCommand('insertText', false, valueStr);

  if (!typed) {
    // Fallback: native setter + synthetic events
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, valueStr);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Blur so React finalises the controlled value
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  return true;
}


/**
 * Detect if PO is showing the UTC clock panel (Panel 1) instead of
 * the duration panel (Panel 2).
 * Panel 1: .value__val shows a real clock time like "09:58:00" (total > 3600s)
 * Panel 2: .value__val shows a duration like "00:00:15" (total <= 3600s)
 * If on Panel 1, try to click the panel toggle to switch to Panel 2.
 */
async function ensureDurationPanel() {
  const block = document.querySelector('.block--expiration-inputs');
  if (!block) return;

  // Check if we're in UTC clock mode (text contains "UTC" is the clearest signal)
  const blockText = block.textContent || '';
  if (!blockText.includes('UTC')) return; // already on duration panel

  console.log('[Avalisa] ensureDurationPanel: clock panel detected — switching to duration panel');

  // Try toggle selectors inside the expiry block (not the dropdown trigger itself)
  const toggleSelectors = [
    '.block--expiration-inputs a',
    '.block--expiration-inputs .block__icon',
    '.block--expiration-inputs [class*="icon"]',
    '.block--expiration-inputs [class*="switch"]',
    '.block--expiration-inputs [class*="toggle"]',
    '.block--expiration-inputs button',
  ];

  for (const sel of toggleSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      console.log('[Avalisa] ensureDurationPanel: trying toggle selector:', sel);
      el.click();
      await sleep(700);
      // Check if we switched (UTC gone from block text)
      if (!document.querySelector('.block--expiration-inputs')?.textContent?.includes('UTC')) {
        console.log('[Avalisa] ensureDurationPanel: switched successfully');
        return;
      }
    }
  }

  console.warn('[Avalisa] ensureDurationPanel: could not switch panels — logging block children to help diagnose:');
  block.querySelectorAll('*').forEach(el => {
    if (el.tagName && el.children.length === 0 && el.textContent.trim()) {
      console.log('[Avalisa]  child:', el.tagName, el.className, JSON.stringify(el.textContent.trim().substring(0, 30)));
    }
  });
}

/**
 * Set PO's expiry timeframe.
 * Always ensures the duration panel (Panel 2) is active first, then
 * opens the dropdown and clicks the matching .dops__timeframes-item.
 */
async function setTimeframe(tf) {
  const tfTimeMap = {
    S30: '00:00:30',
    M1:  '00:01:00', M3:  '00:03:00',
    M5:  '00:05:00', M30: '00:30:00',
    H1:  '01:00:00',
  };
  const targetTime = tfTimeMap[tf];
  if (!targetTime) {
    console.warn('[Avalisa] setTimeframe: unknown tf:', tf);
    return false;
  }

  // Switch to duration panel if UTC clock panel is showing
  await ensureDurationPanel();

  // Already set?
  const valEl = document.querySelector('.block--expiration-inputs .value__val');
  const current = valEl?.textContent?.trim();
  if (current === targetTime) {
    console.log('[Avalisa] setTimeframe: already set to', tf);
    return true;
  }
  console.log('[Avalisa] setTimeframe: current =', current, '→ target =', tf, '(', targetTime, ')');

  // Click the control value to open the dropdown
  const trigger = document.querySelector(
    '.block--expiration-inputs .control__value, ' +
    '.block--expiration-inputs .value__val'
  );
  if (trigger) {
    trigger.click();
    // Poll until .dops__timeframes-item elements appear (lazy-rendered on first open)
    for (let i = 0; i < 25; i++) {
      await sleep(100);
      if (document.querySelectorAll('.dops__timeframes-item').length > 0) break;
    }
  }

  // Try .dops__timeframes-item — Panel 2 items have no "+" prefix
  let items = document.querySelectorAll('.dops__timeframes-item');
  for (const item of items) {
    const text = item.textContent.trim();
    if (text === tf) {
      item.click();
      console.log('[Avalisa] setTimeframe: clicked grid item', tf);
      await sleep(300);
      return true;
    }
  }

  // Fallback: match on HH:MM:SS time string
  for (const item of items) {
    const text = item.textContent.trim();
    if (text === targetTime) {
      item.click();
      console.log('[Avalisa] setTimeframe: clicked item by time string', targetTime);
      await sleep(300);
      return true;
    }
  }

  console.warn('[Avalisa] setTimeframe: could not find option for', tf,
    '| items found:', items.length,
    '| texts:', Array.from(items).map(i => i.textContent.trim()));
  if (trigger) trigger.click(); // close dropdown
  return false;
}

function clickCall() {
  const btn = document.querySelector('a.btn.btn-call');
  if (btn) { btn.click(); return true; }
  return false;
}

function clickPut() {
  const btn = document.querySelector('a.btn.btn-put');
  if (btn) { btn.click(); return true; }
  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Trade Detection (balance-based, no DOM deal counting) ───────────────────

/**
 * Read PO's selected expiry duration from the UI timer element.
 * Screenshot-confirmed: .block--expiration-inputs .value__val contains "00:00:15" etc.
 * Returns milliseconds, defaulting to 60000 if unreadable.
 */
function getExpiryMs() {
  // Primary: use bot's own timeframe setting (reliable, user-selected)
  const tf = state.settings?.timeframe || 'M1';
  const settingsMs = (TF_TO_SECONDS[tf] || 60) * 1000;

  // Secondary: try reading from PO DOM for validation
  const el = document.querySelector('.block--expiration-inputs');
  if (el) {
    const match = el.textContent.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      const domMs = (+match[1] * 3600 + +match[2] * 60 + +match[3]) * 1000;
      if (domMs > 0 && domMs <= 3600000) {
        console.log('[Avalisa] Expiry from DOM:', domMs / 1000 + 's | from settings:', settingsMs / 1000 + 's');
        return domMs;
      }
    }
  }

  console.log('[Avalisa] Expiry from settings (DOM failed):', settingsMs / 1000 + 's');
  return settingsMs;
}

/**
 * Detect that a trade actually opened after clicking CALL/PUT.
 * Uses three signals (first match wins):
 *   1. DOM: PO shows active deal elements when a trade is live
 *   2. Balance: stake is deducted → balance drops
 *   3. Timeout fallback: assume trade opened (click went through)
 *
 * Returns the current balance (for later win/loss comparison).
 */
async function waitForTradeOpen(balanceBefore, amount, timeoutMs = 10000) {
  const threshold = balanceBefore - (amount * 0.3);
  const DEAL_SELECTORS = [
    '.deal', '.deals-list__item', '.active-trade',
    '[class*="deal-timer"]', '[class*="deals-list"] [class*="item"]', '.trade-result',
  ];

  let dealCountBefore = 0;
  for (const sel of DEAL_SELECTORS) {
    dealCountBefore += document.querySelectorAll(sel).length;
  }

  await sleep(1500); // give PO time to process click
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    // Signal 1: new deal element appeared
    let dealCountNow = 0;
    for (const sel of DEAL_SELECTORS) {
      dealCountNow += document.querySelectorAll(sel).length;
    }
    if (dealCountNow > dealCountBefore) {
      const bal = await getBalance();
      console.log('[Avalisa] Trade confirmed via DOM deal element (count:', dealCountBefore, '→', dealCountNow, ') balance:', bal);
      return bal ?? balanceBefore;
    }

    // Signal 2: balance dropped
    const bal = await getBalance();
    if (bal !== null && bal <= threshold) {
      console.log('[Avalisa] Trade confirmed via balance drop:', balanceBefore, '→', bal);
      return bal;
    }

    // Signal 3: after 6s assume trade opened
    if (Date.now() - start > 6000) {
      const finalBal = await getBalance();
      console.log('[Avalisa] Trade assumed open after 6s — balance:', finalBal, '(was:', balanceBefore, ')');
      return finalBal ?? balanceBefore;
    }

    await sleep(250);
  }

  const finalBal = await getBalance();
  console.warn('[Avalisa] waitForTradeOpen: hard timeout — balance:', finalBal);
  return finalBal ?? balanceBefore;
}

// ─── Indicator Helpers ────────────────────────────────────────────────────────
function calcSMA(vals, period) {
  if (vals.length < period) return null;
  const slice = vals.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(1);
}

function calcStdev(vals) {
  if (vals.length < 2) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  return Math.sqrt(variance);
}

function buildIndicators() {
  const candles = getBufferedCandles();
  if (candles.length < 20) return null;
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const price = closes[closes.length - 1];
  const sma10 = calcSMA(closes, 10);
  const sma20 = calcSMA(closes, 20);
  const rsi14 = calcRSI(closes, 14);
  const recentHigh = Math.max(...highs.slice(-20));
  const recentLow = Math.min(...lows.slice(-20));
  const vol = calcStdev(closes.slice(-20));
  const momentum5 = closes.length >= 6
    ? +(((price - closes[closes.length - 6]) / closes[closes.length - 6]) * 100).toFixed(3)
    : null;
  const last3 = candles.slice(-3).map(c => c.close > c.open ? 'bull' : 'bear');

  // SMA20 slope: simple linear slope over last 10 candles using SMA values
  let slope10 = null;
  if (candles.length >= 30) {
    const sma_now = sma20;
    // SMA20 computed 10 candles ago = mean of candles[length-30..length-10]
    const past = candles.slice(candles.length - 30, candles.length - 10);
    if (past.length === 20) {
      const sma_past = past.reduce((s, c) => s + c.close, 0) / 20;
      slope10 = (sma_now - sma_past) / 10; // per-candle slope
    }
  }

  // Last completed candle direction
  let lastCandle = null;
  if (candles.length >= 1) {
    const last = candles[candles.length - 1];
    if (last && Number.isFinite(last.open) && Number.isFinite(last.close)) {
      lastCandle = last.close > last.open ? 'green' : last.close < last.open ? 'red' : 'doji';
    }
  }

  return {
    pair: getCurrentPair(),
    tf: state.settings?.timeframe || 'M1',
    price: +price.toFixed(5),
    rsi14,
    sma10: sma10 ? +sma10.toFixed(5) : null,
    sma20: sma20 ? +sma20.toFixed(5) : null,
    priceVsSma20Pct: sma20 ? +(((price - sma20) / sma20) * 100).toFixed(3) : null,
    recentHigh: +recentHigh.toFixed(5),
    recentLow: +recentLow.toFixed(5),
    rangeFromLowPct: +(((price - recentLow) / (recentHigh - recentLow || 1)) * 100).toFixed(1),
    volatility: vol ? +vol.toFixed(6) : null,
    momentum5,
    last3Candles: last3,
    candleCount: candles.length,
    slope10,
    lastCandle,
  };
}

// ─── Payout Monitor ──────────────────────────────────────────────────────────
function parsePayoutPercent(text) {
  if (!text) return null;
  const m = String(text).match(/\+?\s*(\d{1,3})\s*%/);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return v >= 0 && v <= 200 ? v : null;
}

/**
 * Read the active pair's payout %. Tries several PO layouts and falls back to
 * scanning nearby header text for a +NN% pattern.
 */
function getCurrentPayoutPercent() {
  const directSelectors = [
    '.asset-select .asset__profit',
    '.current-symbol__profit',
    '.block--payout .value__val',
    '.block--profit .value__val',
    '.estimated-profit__val',
    '.profit-value',
    '[class*="payout"] .value__val',
    '[class*="profit"] .value__val',
  ];
  for (const sel of directSelectors) {
    const el = document.querySelector(sel);
    const v = parsePayoutPercent(el?.textContent);
    if (v !== null) return v;
  }
  // Fallback: scan the asset/header area for a +NN% token
  const header = document.querySelector('.asset-select, .current-symbol, .assets-block, .header__asset');
  const v = parsePayoutPercent(header?.textContent);
  if (v !== null) return v;
  return null;
}

/**
 * Scan the Favorites panel for starred pairs and their payouts.
 * Returns [{name, payout, el}] — empty array if no favorites found.
 */
function getFavoritePairs() {
  const containerSelectors = [
    '.assets-favorites-list__item',
    '.favorite-list__item',
    '.pair-favorites__item',
    '.assets-block .favorites-list__item',
    '[class*="favorit"] [class*="item"]',
  ];
  const seen = new Set();
  const results = [];
  for (const sel of containerSelectors) {
    const nodes = document.querySelectorAll(sel);
    if (nodes.length === 0) continue;
    nodes.forEach(node => {
      if (seen.has(node)) return;
      seen.add(node);
      const nameEl = node.querySelector(
        '.assets-favorites-list__label, .asset__name, .pair-name, [class*="label"], [class*="name"]'
      );
      const name = (nameEl?.textContent || node.getAttribute('data-asset') || '').trim();
      const payout = parsePayoutPercent(node.textContent);
      if (name && payout !== null) results.push({ name, payout, el: node });
    });
    if (results.length > 0) break;
  }
  return results;
}

function clickFavoritePair(fav) {
  if (!fav || !fav.el) return false;
  try {
    fav.el.click();
    return true;
  } catch (err) {
    console.warn('[Avalisa] Payout Monitor: click favorite failed', err);
    return false;
  }
}

function getPayoutSettings() {
  const minPct = Number.isFinite(+state.payoutMinPercent) ? +state.payoutMinPercent : 90;
  const action = ['stop', 'switch', 'keep'].includes(state.payoutAction) ? state.payoutAction : 'stop';
  return { minPct, action };
}

/**
 * Enforce the payout monitor rules. Only call on fresh martingale sequence start.
 * Returns { proceed:boolean, halt?:boolean, reason?:string }.
 */
async function checkPayoutBeforeTrade() {
  const { minPct, action } = getPayoutSettings();
  const current = getCurrentPayoutPercent();

  if (current === null) {
    console.warn('[Avalisa] Payout Monitor: could not read current pair payout — proceeding');
    return { proceed: true };
  }
  console.log(`[Avalisa] Payout Monitor: current=${current}% threshold=${minPct}% action=${action}`);

  if (action === 'keep' || current >= minPct) return { proceed: true };

  if (action === 'stop') {
    return { proceed: false, halt: true, reason: `Payout ${current}% below ${minPct}% threshold` };
  }

  // action === 'switch'
  const favorites = getFavoritePairs();
  if (favorites.length === 0) {
    return { proceed: false, halt: true, reason: 'Star at least 1 pair in PO Favorites to use Auto-switch.' };
  }
  favorites.sort((a, b) => b.payout - a.payout);
  const best = favorites[0];
  if (best.payout < minPct) {
    return { proceed: false, halt: true, reason: `No favorite >= ${minPct}% (highest ${best.payout}%)` };
  }

  const currentPair = (getCurrentPair() || '').trim();
  if (best.payout === current || best.name === currentPair) {
    // Tied with current or already on the best favorite — stay put
    return { proceed: true };
  }

  console.log(`[Avalisa] Payout Monitor: switching to ${best.name} (${best.payout}%)`);
  if (!clickFavoritePair(best)) {
    return { proceed: false, halt: true, reason: `Could not switch to ${best.name}` };
  }
  await sleep(1500);
  return { proceed: true };
}

// ─── Trading Engine ───────────────────────────────────────────────────────────
function getNextDirection() {
  // Martingale mode — use user direction setting
  const dir = state.settings.direction;
  if (dir === 'call') return 'call';
  if (dir === 'put') return 'put';
  // alternating
  state.lastDirection = state.lastDirection === 'call' ? 'put' : 'call';
  return state.lastDirection;
}

async function runTradeCycle(generation) {
  if (generation !== state.cycleGeneration) return;
  if (state.stopRequested) return;

  if (state.isTradeOpen) {
    console.log('[Avalisa] Trade already open, waiting...');
    updateStatus('running', 'Trade already open, waiting...');
    await sleep(3000);
    if (state.running && !state.stopRequested) runTradeCycle(generation).catch(err => console.error('[Avalisa] Cycle error:', err));
    return;
  }

  // License check
  const license = await checkLicense();
  if (!license.allowed) {
    if (license._networkError) {
      updateStatus('error', 'Network error — check connection');
    } else {
      updateStatus('error', `Trade limit reached (${license.plan || 'unknown'} plan)`);
      showLimitReachedMessage(license);
    }
    state.running = false;
    updateUI();
    return;
  }

  // Payout monitor — only on fresh martingale sequence starts (never mid-sequence)
  if (state.martingaleStep === 0) {
    const pay = await checkPayoutBeforeTrade();
    if (!pay.proceed) {
      if (pay.halt) {
        console.warn('[Avalisa] Payout Monitor: halting bot —', pay.reason);
        updateStatus('error', `Payout Monitor: ${pay.reason}`);
        state.running = false;
        state.stopRequested = true;
        updateUI();
        return;
      }
    }
  }

  // AI strategy guard: requires lifetime plan
  if (state.settings.strategy === 'ai' && license.plan !== 'lifetime') {
    state.settings.strategy = 'martingale';
    state.settings.aiAssist = false;
    const stratEl = document.getElementById('av-strategy');
    if (stratEl) stratEl.value = 'martingale';
    updateUI();
    updateStatus('error', 'AI strategy requires Lifetime plan. Switched to Martingale.');
  }

  // AI mode: local rule engine — zero network calls
  let aiDecidedDirection = null;
  let aiSignalSnapshot = null;
  let aiSuggestedTimeframe = null;
  if (state.settings.strategy === 'ai') {
    // Wait for warmup — normally satisfied instantly by the updateHistoryNewFast seed
    let candles = getBufferedCandles();
    while (candles.length < REQUIRED_CANDLES && state.running && !state.stopRequested) {
      updateStatus('running', `Loading: ${candles.length}/${REQUIRED_CANDLES}`);
      await sleep(2000);
      candles = getBufferedCandles();
    }
    if (!state.running || state.stopRequested) return;

    const indicators = buildIndicators();
    if (!indicators) {
      updateStatus('error', 'Could not build indicators — skipping cycle');
      await sleep(5000);
      if (state.running) runTradeCycle(generation).catch(console.error);
      return;
    }

    // v2.3.1: settings field is `intensity` (set in saveCurrentSettings/dropdown), not `aiIntensity`.
    // Old code always fell through to 'mid' regardless of user's Low/High pick.
    const intensity = state.settings.intensity || state.settings.aiIntensity || 'mid';
    const sig = globalThis.AvalisaSignalEngine.evaluateSignal(indicators, intensity);
    aiSignalSnapshot = sig.snapshot || null;
    aiSuggestedTimeframe = sig.timeframe || null;

    console.log(`[Avalisa] Charles: action=${sig.action} regime=${sig.snapshot?.regime} tf=${sig.timeframe} reason=${sig.reason || 'ok'} rules=${sig.snapshot?.rulesMatched}`);

    if (sig.action === 'SKIP') {
      // SKIP: wait one candle period of the suggested timeframe, then re-evaluate
      const tf = aiSuggestedTimeframe || state.settings.timeframe || 'M1';
      const candleMs = tf === 'M3' ? 180000 : tf === 'M5' ? 300000 : 60000; // M1 default
      updateStatus('running', `SKIP (${sig.reason || 'no_signal'}) — wait 1 candle`);
      await sleep(candleMs);
      if (state.running && !state.stopRequested && generation === state.cycleGeneration) {
        runTradeCycle(generation).catch(console.error);
      }
      return;
    }
    aiDecidedDirection = sig.action === 'CALL' ? 'call' : 'put';
  }

  const amount = state.currentAmount;
  if (!amount || amount <= 0) {
    state.currentAmount = parseFloat(state.settings.startAmount) || 1.0;
  }
  const safeAmount = state.currentAmount;

  const direction = aiDecidedDirection || getNextDirection();

  updateStatus('running', `Trade #${state.tradesCount + 1} — ${direction.toUpperCase()} $${safeAmount.toFixed(2)}`);

  // AI mode: use signal's suggested timeframe; martingale: user setting
  const tfToUse = (state.settings.strategy === 'ai' && aiSuggestedTimeframe)
    ? aiSuggestedTimeframe
    : (state.settings.timeframe || 'M1');
  await setTimeframe(tfToUse);

  if (!setTradeAmount(safeAmount)) {
    updateStatus('error', 'Could not set trade amount — page may have changed');
    return;
  }
  await sleep(300);

  await sleep(500);
  const balanceBefore = await getBalance();
  console.log('[Avalisa] Balance before trade:', balanceBefore);

  const expiryMs = getExpiryMs();

  const preTradeSignatures = getLatestDealSignatures();
  console.log('[Avalisa] pre-trade deal signatures:', preTradeSignatures);

  const tradeStartTs = Date.now();
  const placed = direction === 'call' ? clickCall() : clickPut();
  if (!placed) {
    updateStatus('error', `Could not find ${direction.toUpperCase()} button`);
    return;
  }

  const balanceDuringTrade = await waitForTradeOpen(balanceBefore, safeAmount, 10000);

  state.isTradeOpen = true;
  console.log('[Avalisa] Trade confirmed open. isTradeOpen = true. Balance during:', balanceDuringTrade);

  const tradeGuardTimeout = setTimeout(() => {
    if (state.isTradeOpen) {
      console.warn('[Avalisa] Safety timeout — clearing isTradeOpen');
      state.isTradeOpen = false;
    }
  }, expiryMs + 30000);

  state.tradesCount++;
  await incrementTrade();
  updateTradeCounter();

  updateStatus('running', `Trade open — waiting ${Math.round(expiryMs / 1000)}s for result…`);
  await sleep(expiryMs + 3000);

  clearTimeout(tradeGuardTimeout);
  state.isTradeOpen = false;

  // 3-tier result detection: WS close event → DOM scrape → balance diff
  const result = await resolveTradeResult(balanceBefore, balanceDuringTrade, safeAmount, tradeStartTs, preTradeSignatures);
  const balanceAfter = await getBalance();

  if (state.jwt) {
    withRetry(() => apiPost('/api/trades/log', {
      pair: getCurrentPair(),
      direction,
      amount: safeAmount,
      result,
      balanceBefore,
      balanceAfter,
      isDemo: isDemoMode(),
      strategy: state.settings?.strategy || 'martingale',
      signalSnapshot: aiSignalSnapshot,
    })).catch(console.error);
  }

  applyMartingaleLogic(result);

  updateStatus('running', `Last: ${result.toUpperCase()} | Next: $${state.currentAmount.toFixed(2)}`);
  updateBottomStatus();

  if (!state.running || state.stopRequested || generation !== state.cycleGeneration) return;

  // AI mode: short delay (AI decides timing). Martingale mode: user delay.
  const delay = state.settings.strategy === 'ai' ? 1500 : (state.settings.delaySeconds || 6) * 1000;
  await sleep(delay);

  if (state.running && !state.stopRequested && generation === state.cycleGeneration) {
    runTradeCycle(generation).catch(err => console.error('[Avalisa] Cycle error:', err));
  }
}

// v2.3.1: stronger guard. Old code reset to startAmount only when amount<=0,
// allowing NaN to leak through. Now any non-finite or non-positive value triggers reset.
function applyMartingaleLogic(result) {
  const s = state.settings;
  // Guard against undefined/NaN settings values from stale stored settings
  const multiplier = parseFloat(s.martingaleMultiplier) || 2.0;
  const startAmount = parseFloat(s.startAmount) || 1.0;
  const maxSteps = s.martingaleSteps === 'infinite' ? Infinity : (parseInt(s.martingaleSteps) || Infinity);

  // TIE: stake returned, no profit/loss. Hold current amount and step, repeat trade.
  if (result === 'tie') {
    console.log(`[Avalisa] Martingale: result=TIE step=${state.martingaleStep} nextAmount=${state.currentAmount} (holding)`);
    return;
  }

  if (result === 'loss') {
    if (state.martingaleStep < maxSteps) {
      state.martingaleStep++;
      state.currentAmount = parseFloat((state.currentAmount * multiplier).toFixed(2));
    } else {
      // Max steps reached — reset
      state.martingaleStep = 0;
      state.currentAmount = startAmount;
    }
  } else {
    // Win — reset
    state.martingaleStep = 0;
    state.currentAmount = startAmount;
  }
  console.log(`[Avalisa] Martingale: result=${result} step=${state.martingaleStep} nextAmount=${state.currentAmount} multiplier=${multiplier}`);
}

function isDemoMode() {
  // Check balance-info-block label for "Demo" text
  const labels = document.querySelectorAll('[class*="balance-info-block"] [class*="label"], [class*="balance__label"]');
  for (const el of labels) {
    if (el.textContent.includes('Demo')) return true;
  }
  // Fallback: demo balance element has a positive value
  const demoEl = document.querySelector('.js-balance-demo');
  if (demoEl && parseFloat(demoEl.textContent.replace(/[^0-9.]/g, '')) > 0) return true;
  return false;
}

function getCurrentPair() {
  // Try to read the selected asset from the PO header
  const assetEl = document.querySelector('.asset-select .asset__name') ||
    document.querySelector('.current-symbol') ||
    document.querySelector('[class*="asset-name"]');
  return assetEl?.textContent?.trim() || 'UNKNOWN';
}

// ─── UI Overlay ────────────────────────────────────────────────────────────────
let overlayEl = null;

function injectOverlay() {
  if (document.getElementById('avalisa-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'avalisa-overlay';
  overlay.innerHTML = getOverlayHTML();

  const style = document.createElement('style');
  style.textContent = getOverlayCSS();

  document.head.appendChild(style);
  document.body.appendChild(overlay);
  overlayEl = overlay;

  bindOverlayEvents();
  updateUI();
  if (state.jwt) checkClaimStatus();
}

function injectHeaderButton() {
  if (document.getElementById('avalisa-header-btn')) return;
  const header = document.querySelector('.header__right') ||
    document.querySelector('.header-right') ||
    document.querySelector('header');
  if (!header) return;

  const btn = document.createElement('button');
  btn.id = 'avalisa-header-btn';
  btn.textContent = 'Bot Menu';
  btn.style.cssText = `
    background: #7c3aed; color: #fff; border: none; border-radius: 6px;
    padding: 6px 14px; font-size: 13px; font-weight: 600; cursor: pointer;
    margin-left: 10px; z-index: 9999;
  `;
  btn.addEventListener('click', () => {
    const panel = document.getElementById('avalisa-overlay');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
  });
  header.appendChild(btn);
}

function getOverlayHTML() {
  const logoUrl = chrome.runtime.getURL('icons/AvalisaBot_Logo.png');
  return `
    <div id="avalisa-panel">
      <div class="av-header">
        <span class="av-logo">
          <img src="${logoUrl}" alt="Avalisa" class="av-logo-img" />
          <span>Avalisa Bot</span>
        </span>
        <button id="av-close" class="av-icon-btn">✕</button>
      </div>

      <div id="av-auth-section" class="av-section">
        <div id="av-login-form">
          <input id="av-email" type="email" placeholder="Email" class="av-input" />
          <input id="av-password" type="password" placeholder="Password" class="av-input" />
          <button id="av-login-btn" class="av-btn av-btn-primary">Login</button>
          <button id="av-register-free-btn" class="av-btn av-btn-outline">Register Free</button>
        </div>
        <div id="av-logged-in" style="display:none">
          <div class="av-user-row">
            <span id="av-user-email" class="av-label"></span>
            <span id="av-plan-badge" class="av-plan-badge"></span>
            <button id="av-logout-btn" class="av-btn av-btn-sm">Logout</button>
          </div>
        </div>
      </div>

      <div class="av-section">
        <div class="av-row" id="av-row-strategy">
          <label class="av-label">Strategy</label>
          <select id="av-strategy" class="av-select" title="">
            <option value="martingale">Martingale</option>
            <option value="ai">Charles (AI)</option>
          </select>
        </div>
        <div class="av-row av-row-sub" id="av-row-bot-pill" style="display:none">
          <span></span>
          <div id="av-bot-pill" class="av-bot-pill" title="Open bot settings">
            <span class="av-bot-pill-ai">AI</span>
            <span class="av-bot-pill-name">Charles</span>
            <svg class="av-bot-pill-arrow" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 8 L8 2 M8 2 L4 2 M8 2 L8 6" stroke="#A78BFA" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
          </div>
        </div>
        <div class="av-row" id="av-row-direction">
          <label class="av-label">Direction</label>
          <select id="av-direction" class="av-select">
            <option value="alternating">Alternating</option>
            <option value="call">Always Buy</option>
            <option value="put">Always Sell</option>
          </select>
        </div>
        <div class="av-row" id="av-row-intensity" style="display:none">
          <label class="av-label">Intensity</label>
          <select id="av-intensity" class="av-select">
            <option value="low">Low</option>
            <option value="mid" selected>Mid</option>
            <option value="high">High</option>
          </select>
        </div>
        <div class="av-row">
          <label class="av-label">Start Amount ($)</label>
          <input id="av-start-amount" type="number" min="1" step="1" value="1" class="av-input av-input-sm" />
        </div>
        <div class="av-row">
          <label class="av-label">Martingale ×</label>
          <select id="av-multiplier" class="av-select">
            <option value="2.0" selected>2.0×</option>
            <option value="2.2">2.2×</option>
            <option value="2.4">2.4×</option>
            <option value="2.6">2.6×</option>
            <option value="2.8">2.8×</option>
            <option value="3.0">3.0×</option>
          </select>
        </div>
        <div class="av-row">
          <label class="av-label">Martingale Steps</label>
          <select id="av-steps" class="av-select">
            <option value="infinite" selected>Infinite</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
            <option value="6">6</option>
            <option value="8">8</option>
            <option value="10">10</option>
            <option value="12">12</option>
          </select>
        </div>
      </div>

      <div class="av-section">
        <div class="av-section-title">Payout Monitor</div>
        <div class="av-row">
          <label class="av-label" for="av-payout-min">Minimum payout %</label>
          <input id="av-payout-min" type="number" min="1" max="100" step="1" value="90"
            class="av-input av-input-sm" />
        </div>
        <div class="av-radio-group">
          <label class="av-radio-item">
            <input type="radio" name="av-payout-action" value="stop" checked />
            <span>Stop bot</span>
          </label>
          <label class="av-radio-item">
            <input type="radio" name="av-payout-action" value="switch" />
            <span>Auto-switch to highest-payout favorite</span>
          </label>
          <label class="av-radio-item">
            <input type="radio" name="av-payout-action" value="keep" />
            <span>Keep trading (ignore payout)</span>
          </label>
        </div>
      </div>

      <div class="av-section av-controls">
        <button id="av-start-btn" class="av-btn av-btn-green">▶ Start</button>
        <button id="av-stop-btn" class="av-btn av-btn-red" disabled>■ Stop</button>
      </div>

      <div class="av-section av-status-block">
        <div id="av-status" class="av-status">Status: Stopped</div>
        <div id="av-token-status" class="av-counter" style="display:none"></div>
        <div id="av-trade-counter" class="av-counter">Trades this session: 0</div>
      </div>

      <div id="av-limit-msg" class="av-limit-msg" style="display:none">
        <p>Trade limit reached!</p>
        <a id="av-affiliate-link" class="av-btn av-btn-primary" target="_blank">Register Free Account</a>
        <a id="av-upgrade-link" class="av-btn av-btn-outline" target="_blank">Upgrade Plan</a>
        <div id="av-claim-section" style="margin-top:8px; border-top:1px solid #2a4060; padding-top:8px;">
          <p style="font-size:11px; color:#8fa8c8; margin:0 0 6px 0;">Already registered via affiliate link?</p>
          <button id="av-claim-btn" style="width:100%; padding:6px; background:#7c3aed; color:white; border:none; border-radius:4px; font-size:12px; cursor:pointer;">
            Claim Free Access
          </button>
          <div id="av-claim-uid-input" style="display:none; margin-top:6px;">
            <input id="av-claim-uid" type="text" placeholder="Enter your Pocket Option UID"
              style="width:100%; padding:5px 8px; background:#0f0f23; border:1px solid #2d2d5b; border-radius:4px; color:#e2e8f0; font-size:11px; box-sizing:border-box; margin-bottom:4px;" />
            <button id="av-claim-submit" style="width:100%; padding:5px; background:#7c3aed; color:white; border:none; border-radius:4px; font-size:11px; cursor:pointer;">
              Submit Claim
            </button>
          </div>
          <div id="av-claim-status" style="font-size:11px; margin-top:6px; display:none;"></div>
        </div>
      </div>

      <div class="av-footer">
        <a href="https://avalisabot.vercel.app" target="_blank" rel="noopener">avalisabot.vercel.app</a>
        <span class="av-footer-sep"> · </span>
        <a href="mailto:AvalisaPOBot@gmail.com">AvalisaPOBot@gmail.com</a>
      </div>
    </div>
  `;
}

function getOverlayCSS() {
  return `
    #avalisa-overlay {
      position: fixed; top: 80px; right: 20px; z-index: 999999;
      display: flex; font-family: 'Inter', system-ui, sans-serif;
    }
    #avalisa-panel {
      background: #1a1a2e; border: 1px solid #2d2d5b; border-radius: 12px;
      padding: 16px; width: 280px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      color: #e2e8f0;
    }
    .av-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .av-logo {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 15px; font-weight: 700; color: #a78bfa;
    }
    .av-logo-img { height: 24px; width: auto; display: block; flex-shrink: 0; }
    .av-icon-btn { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 14px; }
    .av-icon-btn:hover { color: #e2e8f0; }
    .av-section { margin-bottom: 12px; border-bottom: 1px solid #2d2d5b; padding-bottom: 12px; }
    .av-section:last-child { border-bottom: none; margin-bottom: 0; }
    .av-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .av-label { font-size: 12px; color: #94a3b8; }
    .av-select, .av-input {
      background: #0f0f23; border: 1px solid #2d2d5b; border-radius: 6px;
      color: #e2e8f0; font-size: 12px; padding: 4px 8px;
    }
    .av-select { width: 130px; box-sizing: border-box; }
    .av-select:disabled, .av-input:disabled { opacity: 0.4; cursor: not-allowed; }
    .av-input { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 6px 10px; }
    .av-input-sm { width: 130px; margin-top: 0; padding: 4px 8px; }
    .av-radio-item input[type="radio"]:disabled + span { opacity: 0.4; cursor: not-allowed; }
    .av-radio-item input[type="radio"]:disabled { cursor: not-allowed; }
    .av-bot-pill {
      display: inline-flex; align-items: center; gap: 8px;
      background: #1F1A3E; border: 0.5px solid #7C3AED; border-radius: 8px;
      padding: 8px 12px; cursor: pointer; width: 130px; box-sizing: border-box;
      transition: background 0.15s ease;
    }
    .av-bot-pill:hover { background: #2A2350; }
    .av-bot-pill-ai {
      background: #7C3AED; color: #fff; font-size: 9px; font-weight: 700;
      padding: 2px 5px; border-radius: 4px; letter-spacing: 0.05em;
    }
    .av-bot-pill-name { color: #ECEAFF; font-size: 13px; flex: 1; }
    .av-bot-pill-arrow { flex-shrink: 0; }
    .av-row-sub { margin-top: -4px; margin-bottom: 8px; }
    .av-sublink {
      font-size: 11px; color: #A78BFA; text-decoration: none; cursor: pointer;
    }
    .av-sublink:hover { color: #C4B5FD; text-decoration: underline; }
    .av-controls { display: flex; gap: 8px; }
    .av-btn {
      border: none; border-radius: 6px; padding: 8px 14px; font-size: 13px;
      font-weight: 600; cursor: pointer; transition: opacity 0.2s; flex: 1;
    }
    .av-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .av-btn-primary { background: #7c3aed; color: #fff; }
    .av-btn-outline { background: transparent; border: 1px solid #7c3aed; color: #a78bfa; }
    .av-btn-green { background: #059669; color: #fff; }
    .av-btn-red { background: #dc2626; color: #fff; }
    .av-btn-sm { padding: 4px 10px; font-size: 11px; flex: none; }
    #av-logout-btn { background: #dc2626; color: #ffffff; }
    .av-user-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .av-user-row .av-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .av-plan-badge {
      font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .av-plan-badge.plan-lifetime { background: #7c3aed; color: #fff; }
    .av-plan-badge.plan-basic { background: #059669; color: #fff; }
    .av-plan-badge.plan-free { background: #3b82f6; color: #fff; }
    .av-status-block { }
    .av-status { font-size: 12px; color: #a78bfa; margin-bottom: 4px; }
    .av-status.error { color: #f87171; }
    .av-status.running { color: #34d399; }
    .av-counter { font-size: 11px; color: #64748b; margin-bottom: 2px; }
    .av-limit-msg { text-align: center; font-size: 12px; }
    .av-limit-msg p { color: #fbbf24; margin-bottom: 8px; }
    .av-limit-msg .av-btn { display: block; text-align: center; text-decoration: none; margin-bottom: 6px; }
    #av-auth-section input.av-input { margin-bottom: 6px; }
    #av-login-btn, #av-register-free-btn { width: 100%; margin-bottom: 6px; }
    #av-logged-in { display: flex; justify-content: space-between; align-items: center; }
    .av-section-title {
      font-size: 11px; font-weight: 700; color: #a78bfa; text-transform: uppercase;
      letter-spacing: 0.5px; margin-bottom: 8px;
    }
    .av-radio-group { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
    .av-radio-item {
      display: flex; align-items: center; gap: 8px; cursor: pointer;
      font-size: 12px; color: #cbd5e1;
    }
    .av-radio-item input[type="radio"] { accent-color: #7c3aed; cursor: pointer; margin: 0; }
    .av-footer {
      margin-top: 12px; padding-top: 10px; border-top: 1px solid #2d2d5b;
      font-size: 10px; color: #64748b; text-align: center;
    }
    .av-footer a { color: #94a3b8; text-decoration: none; }
    .av-footer a:hover { color: #a78bfa; }
    .av-footer-sep { color: #475569; }
  `;
}

function applyStrategyUI(strategy) {
  const isAi = strategy === 'ai';
  const rowDirection = document.getElementById('av-row-direction');
  const rowIntensity = document.getElementById('av-row-intensity');
  const rowPill = document.getElementById('av-row-bot-pill');

  if (rowDirection) rowDirection.style.display = isAi ? 'none' : 'flex';
  if (rowIntensity) rowIntensity.style.display = isAi ? 'flex' : 'none';
  if (rowPill) rowPill.style.display = isAi ? 'flex' : 'none';
}

function bindOverlayEvents() {
  document.getElementById('av-close').addEventListener('click', () => {
    document.getElementById('avalisa-overlay').style.display = 'none';
  });

  document.getElementById('av-login-btn').addEventListener('click', handleLogin);
  document.getElementById('av-register-free-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: state.affiliateLink });
  });
  document.getElementById('av-logout-btn').addEventListener('click', handleLogout);
  document.getElementById('av-start-btn').addEventListener('click', startBot);
  document.getElementById('av-stop-btn').addEventListener('click', stopBot);

  // Strategy dropdown — toggle UI between Martingale and AI mode
  document.getElementById('av-strategy').addEventListener('change', (e) => {
    const strategy = e.target.value;
    state.settings.aiAssist = strategy === 'ai';
    applyStrategyUI(strategy);
    updateBottomStatus();
    saveCurrentSettings();
  });

  // Bot pill — open dashboard bots tab
  const pill = document.getElementById('av-bot-pill');
  if (pill) {
    pill.addEventListener('click', () => {
      window.open(`${DASHBOARD_URL}/dashboard?tab=bots`, '_blank');
    });
  }

  // Settings changes — auto-save
  ['av-direction', 'av-multiplier', 'av-steps', 'av-intensity'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', saveCurrentSettings);
  });
  document.getElementById('av-start-amount').addEventListener('change', saveCurrentSettings);

  // Payout Monitor inputs — persist directly to chrome.storage.local
  const payoutMin = document.getElementById('av-payout-min');
  if (payoutMin) {
    const commit = () => {
      let v = parseInt(payoutMin.value, 10);
      if (!Number.isFinite(v)) v = 90;
      v = Math.max(1, Math.min(100, v));
      payoutMin.value = v;
      state.payoutMinPercent = v;
      chrome.storage.local.set({ payoutMinPercent: v });
    };
    payoutMin.addEventListener('change', commit);
    payoutMin.addEventListener('blur', commit);
  }
  document.querySelectorAll('input[name="av-payout-action"]').forEach(r => {
    r.addEventListener('change', () => {
      const sel = document.querySelector('input[name="av-payout-action"]:checked');
      if (!sel) return;
      state.payoutAction = sel.value;
      chrome.storage.local.set({ payoutAction: sel.value });
    });
  });

  document.getElementById('av-affiliate-link').href = state.affiliateLink;
  document.getElementById('av-upgrade-link').href = `${DASHBOARD_URL}/pricing`;

  document.getElementById('av-claim-btn').addEventListener('click', handleClaimClick);
  document.getElementById('av-claim-submit').addEventListener('click', handleClaimSubmit);
}

function getPoUidFromDom() {
  const selectors = ['.js-user-id', '[data-user-id]', '.user-id', '[class*="user-id"]', '[data-uid]'];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const uid = (el.textContent || el.getAttribute('data-user-id') || el.getAttribute('data-uid') || '').trim();
      if (uid && /^\d+$/.test(uid)) return uid;
    }
  }
  return null;
}

function setClaimStatus(text, color) {
  const el = document.getElementById('av-claim-status');
  if (!el) return;
  el.style.display = 'block';
  el.style.color = color;
  el.innerHTML = text;
}

async function handleClaimClick() {
  if (!state.jwt) {
    setClaimStatus('⚠️ Please log in to claim free access.', '#f59e0b');
    return;
  }

  // Try to read UID from PO DOM
  const domUid = getPoUidFromDom();
  if (domUid) {
    // UID found — submit directly
    document.getElementById('av-claim-btn').disabled = true;
    document.getElementById('av-claim-btn').textContent = 'Submitting...';
    await submitClaim(domUid);
    document.getElementById('av-claim-btn').disabled = false;
    document.getElementById('av-claim-btn').textContent = '🎯 Claim Free Access';
  } else {
    // UID not found in DOM — show manual input
    document.getElementById('av-claim-uid-input').style.display = 'block';
    document.getElementById('av-claim-btn').style.display = 'none';
  }
}

async function handleClaimSubmit() {
  const uid = (document.getElementById('av-claim-uid')?.value || '').trim();
  if (!uid) {
    setClaimStatus('⚠️ Please enter your Pocket Option UID.', '#f59e0b');
    return;
  }
  const btn = document.getElementById('av-claim-submit');
  btn.disabled = true;
  btn.textContent = 'Submitting...';
  await submitClaim(uid);
  btn.disabled = false;
  btn.textContent = 'Submit Claim';
}

async function submitClaim(poUid) {
  try {
    const data = await apiPost('/api/license/claim', { poUid });
    if (data.message) {
      setClaimStatus('✅ Claim submitted! We\'ll review within 24 hours.', '#34d399');
      document.getElementById('av-claim-uid-input').style.display = 'none';
    } else if (data.error) {
      const err = data.error;
      if (err.includes('under review')) {
        setClaimStatus('⏳ Your claim is under review.', '#f59e0b');
      } else if (err.includes('already been approved')) {
        setClaimStatus('✅ Already approved! Refresh to see your plan.', '#34d399');
      } else if (err.includes('already linked to another account') || err.includes('already been claimed')) {
        setClaimStatus('❌ This UID is already linked to another account.', '#f87171');
      } else {
        setClaimStatus(`❌ ${err}`, '#f87171');
      }
    }
  } catch (err) {
    setClaimStatus('❌ Network error. Please try again.', '#f87171');
  }
}

async function checkClaimStatus() {
  if (!state.jwt) return;
  try {
    const data = await apiGet('/api/license/claim/status');
    if (!data.claimStatus || data.claimStatus === 'none') return;

    const limitMsg = document.getElementById('av-limit-msg');
    if (limitMsg) limitMsg.style.display = 'block';

    if (data.claimStatus === 'pending') {
      setClaimStatus('⏳ Your claim is under review.', '#f59e0b');
    } else if (data.claimStatus === 'approved') {
      setClaimStatus('✅ Already approved! Refresh to see your plan.', '#34d399');
    } else if (data.claimStatus === 'rejected') {
      const note = data.claimNote || '';
      if (note === 'not_found') {
        setClaimStatus('❌ UID not found under our affiliate link. Please register via our link, or upgrade your plan.' +
          ` <a href="${state.affiliateLink}" style="color:#a78bfa">Affiliate link</a> | <a href="${DASHBOARD_URL}/pricing" style="color:#a78bfa">Pricing</a>`, '#f87171');
      } else if (note === 'uid_mismatch') {
        setClaimStatus('❌ UID mismatch. Contact support.', '#f87171');
      } else {
        setClaimStatus(`❌ Claim rejected: ${note}. <a href="${DASHBOARD_URL}/pricing" style="color:#a78bfa">Upgrade your plan</a>`, '#f87171');
      }
    }
  } catch (err) {
    // silent fail
  }
}

async function handleLogin() {
  const email = document.getElementById('av-email').value.trim();
  const password = document.getElementById('av-password').value;
  if (!email || !password) return;

  try {
    updateStatus('running', '⏳ Connecting to server...');
    const res = await withRetry(() => fetchWithTimeout(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }));
    const data = await res.json();
    if (!res.ok) {
      updateStatus('error', data.error || 'Login failed');
      return;
    }
    state.jwt = data.token;
    state.userId = data.user.id;
    await chrome.storage.local.set({ jwt: data.token, userId: data.user.id, userEmail: email });
    // Seed token status + license info
    checkLicense().then(lic => { state.licenseInfo = lic; updateUI(); }).catch(() => {});
    apiGet('/api/ai/token-status').then(ts => {
      if (ts) {
        if (ts.remaining !== undefined) state.aiTokensRemaining = ts.remaining;
        if (ts.tokensLimit !== undefined) state.aiTokensLimit = ts.tokensLimit;
        if (ts.unlimited) state.aiUnlimited = true;
      }
      updateBottomStatus();
    }).catch(() => {});
    updateUI();
    updateStatus('running', 'Logged in!');
  } catch (err) {
    updateStatus('error', 'Login error — check connection');
  }
}

function handleLogout() {
  state.jwt = null;
  state.userId = null;
  chrome.storage.local.remove(['jwt', 'userId', 'userEmail']);
  updateUI();
}

function diagnosePOInterface() {
  console.log('[Avalisa] === PO INTERFACE DIAGNOSTIC ===');

  // Find timeframe elements by keyword
  const tfKeywords = ['timeframe', 'time-frame', 'duration', 'expir', 'period'];
  tfKeywords.forEach(kw => {
    const els = document.querySelectorAll(`[class*="${kw}"], [data-${kw}]`);
    if (els.length) {
      els.forEach(el => console.log(`[Avalisa] TF element (${kw}):`, el.className, el.textContent.trim().substring(0, 50)));
    }
  });

  // Find all buttons/clickable elements with time-like text
  document.querySelectorAll('button, [role="button"], li, .item').forEach(el => {
    const text = el.textContent.trim();
    if (/^(S\d+|M\d+|H\d+|\d+[smh])$/i.test(text)) {
      console.log('[Avalisa] Time button found:', el.tagName, el.className, text);
    }
  });

  // Find all input elements
  const inputs = document.querySelectorAll('input');
  inputs.forEach(inp => {
    console.log('[Avalisa] Input found:', inp.className, inp.name, inp.type, inp.value);
  });

  // Find active/selected element
  const active = document.querySelector('.active, .selected, [aria-selected="true"]');
  if (active) console.log('[Avalisa] Active element:', active.className, active.textContent.trim());

  console.log('[Avalisa] === END DIAGNOSTIC ===');
}

// ─── Candle History Prefill ───────────────────────────────────────────────────
async function prefillCandleHistory() {
  console.log('[Avalisa] prefillCandleHistory: passive mode — waiting for updateHistoryNewFast from PO');
  // History data arrives automatically via updateHistoryNewFast on page load and pair changes.
  // No manual request needed — handled by AVALISA_WS_HISTORY message handler.
}

// ─── Status Display ──────────────────────────────────────────────────────────
function updateBottomStatus() {
  const isAi = state.settings?.strategy === 'ai';

  // Idle AI status: reflect candle-buffer readiness in the main status line.
  // Skip while running — runTradeCycle drives the status text itself.
  if (isAi && !state.running) {
    const n = getBufferedCandles().length;
    if (n === 0) {
      updateStatus('', 'Waiting for pair data...');
    } else if (n < REQUIRED_CANDLES) {
      updateStatus('', `Loading: ${n}/${REQUIRED_CANDLES}`);
    } else {
      updateStatus('', 'Ready');
    }
  }

  // Trade allowance — only visible when strategy=ai
  const tokenEl = document.getElementById('av-token-status');
  if (tokenEl) {
    const allowance = state.licenseInfo?.aiTradesAllowance;
    const usedCount = state.licenseInfo?.aiTradesUsed;
    if (isAi && Number.isFinite(allowance) && Number.isFinite(usedCount)) {
      tokenEl.textContent = `Trade allowance: ${usedCount}/${allowance}`;
      tokenEl.style.display = '';
    } else {
      tokenEl.style.display = 'none';
    }
  }
}

async function startBot() {
  if (state.running) return;

  diagnosePOInterface();

  await saveCurrentSettings();
  const license = await checkLicense();

  if (!license.allowed) {
    showLimitReachedMessage(license);
    return;
  }

  state.cycleGeneration++;           // invalidates any still-running old cycles
  state.running = true;
  state.stopRequested = false;
  state.isTradeOpen = false;         // clear any stale open-trade flag from last run
  state.currentAmount = parseFloat(state.settings.startAmount) || 1.0;
  state.martingaleStep = 0;

  const gen = state.cycleGeneration;
  updateUI();
  updateStatus('running', 'Starting...');
  prefillCandleHistory().catch(console.error);
  runTradeCycle(gen);
}

function stopBot() {
  state.cycleGeneration++;           // invalidates any running cycle immediately
  state.running = false;
  state.stopRequested = true;
  state.isTradeOpen = false;
  updateUI();
  updateStatus('', 'Stopped');
  updateBottomStatus(); // re-evaluate idle AI status (Ready / Loading / Waiting)
}

async function saveCurrentSettings() {
  const strategy = document.getElementById('av-strategy')?.value || 'martingale';
  const intensityEl = document.getElementById('av-intensity');
  const intensity = intensityEl && ['low', 'mid', 'high'].includes(intensityEl.value)
    ? intensityEl.value
    : (state.settings?.intensity || 'mid');
  const settings = {
    strategy,
    timeframe: state.settings?.timeframe || 'M1',
    direction: document.getElementById('av-direction').value,
    delaySeconds: state.settings?.delaySeconds ?? 6,
    martingaleMultiplier: parseFloat(document.getElementById('av-multiplier').value),
    martingaleSteps: document.getElementById('av-steps').value,
    startAmount: parseFloat(document.getElementById('av-start-amount').value) || 1.0,
    aiAssist: strategy === 'ai',
    intensity,
  };
  await saveSettings(settings);

  if (state.jwt) {
    apiPost('/api/settings', settings).catch(console.error);
  }
}

function updateUI() {
  const startBtn = document.getElementById('av-start-btn');
  const stopBtn = document.getElementById('av-stop-btn');
  const loginForm = document.getElementById('av-login-form');
  const loggedIn = document.getElementById('av-logged-in');

  if (startBtn) startBtn.disabled = state.running;
  if (stopBtn) stopBtn.disabled = !state.running;

  // Lock config inputs while the bot is Running — prevents mid-run strategy/config crashes
  const lockedIds = [
    'av-strategy', 'av-direction', 'av-intensity',
    'av-start-amount', 'av-multiplier', 'av-steps',
    'av-payout-min',
  ];
  const lockTitle = state.running ? 'Stop bot to change strategy' : '';
  lockedIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = state.running; el.title = lockTitle; }
  });
  document.querySelectorAll('input[name="av-payout-action"]').forEach(r => {
    r.disabled = state.running;
    r.title = lockTitle;
  });

  // Auth UI
  if (state.jwt) {
    if (loginForm) loginForm.style.display = 'none';
    if (loggedIn) loggedIn.style.display = 'flex';
    chrome.storage.local.get('userEmail', data => {
      const emailEl = document.getElementById('av-user-email');
      if (emailEl && data.userEmail) emailEl.textContent = data.userEmail;
    });
    // Plan badge
    const badgeEl = document.getElementById('av-plan-badge');
    if (badgeEl && state.licenseInfo?.plan) {
      const plan = state.licenseInfo.plan;
      const cls = plan === 'lifetime' ? 'plan-lifetime' : plan === 'basic' ? 'plan-basic' : 'plan-free';
      badgeEl.className = `av-plan-badge ${cls}`;
      badgeEl.textContent = plan;
    }
  } else {
    if (loginForm) loginForm.style.display = 'block';
    if (loggedIn) loggedIn.style.display = 'none';
  }

  // Load settings into UI
  const s = state.settings;
  if (s) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('av-strategy', s.strategy || 'martingale');
    set('av-timeframe', (s.timeframe === 'S15' ? 'S30' : s.timeframe) || 'M1');
    set('av-direction', s.direction || 'alternating');
    set('av-delay', s.delaySeconds || 6);
    set('av-multiplier', parseFloat(s.martingaleMultiplier || 2.0).toFixed(1));
    set('av-steps', s.martingaleSteps || 'infinite');
    set('av-start-amount', s.startAmount || 1.0);
    set('av-intensity', ['low', 'mid', 'high'].includes(s.intensity) ? s.intensity : 'mid');

    // Apply AI/Martingale UI layout
    applyStrategyUI(s.strategy || 'martingale');

    // Payout Monitor values from state (seeded from chrome.storage.local)
    const payoutMin = document.getElementById('av-payout-min');
    if (payoutMin) {
      const v = Number.isFinite(+state.payoutMinPercent) ? +state.payoutMinPercent : 90;
      payoutMin.value = Math.max(1, Math.min(100, v));
    }
    const action = ['stop', 'switch', 'keep'].includes(state.payoutAction) ? state.payoutAction : 'stop';
    const radio = document.querySelector(`input[name="av-payout-action"][value="${action}"]`);
    if (radio) radio.checked = true;

    updateBottomStatus();
  }
}

function updateStatus(type, message) {
  const el = document.getElementById('av-status');
  if (!el) return;
  el.textContent = `Status: ${message}`;
  el.className = `av-status${type ? ' ' + type : ''}`;
}

function updateTradeCounter() {
  const el = document.getElementById('av-trade-counter');
  if (!el) return;
  const license = state.licenseInfo;
  if (license?.plan === 'free') {
    el.textContent = `Trades: ${license.tradesUsed || state.tradesCount} / ${license.tradesLimit} free`;
  } else if (license?.plan === 'basic') {
    el.textContent = `Trades: ${license.tradesUsed} / ${license.tradesLimit}`;
  } else {
    el.textContent = `Trades this session: ${state.tradesCount}`;
  }
}

function showLimitReachedMessage(license) {
  const limitMsg = document.getElementById('av-limit-msg');
  if (limitMsg) limitMsg.style.display = 'block';
  updateStatus('error', license?.reason || 'Limit reached');
}

// ─── Load affiliate link from backend ────────────────────────────────────────
async function loadAffiliateLink() {
  // Check storage first (cached from last run)
  const stored = await new Promise(resolve =>
    chrome.storage.local.get('affiliateLink', d => resolve(d.affiliateLink || null))
  );
  if (stored) state.affiliateLink = stored;

  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/config/affiliate-link`, {});
    const data = await res.json();
    if (data?.url) {
      state.affiliateLink = data.url;
      chrome.storage.local.set({ affiliateLink: data.url });
    }
  } catch (err) {
    // silent — use stored or hardcoded fallback
  }

  // Update overlay links if already injected
  const el = document.getElementById('av-affiliate-link');
  if (el) el.href = state.affiliateLink;
  const btn = document.getElementById('av-register-free-btn');
  if (btn) btn.dataset.href = state.affiliateLink;
}



// ─── Load settings from backend on startup ────────────────────────────────────
async function loadSettingsFromBackend() {
  if (!state.jwt) return;
  try {
    const data = await apiGet('/api/settings');
    if (data && !data.error) {
      state.settings = { ...getDefaultSettings(), ...data };
      await new Promise(resolve => chrome.storage.local.set({ settings: state.settings }, resolve));
      console.log('[Avalisa] Settings loaded from backend');
    }
  } catch (err) {
    console.warn('[Avalisa] Could not load settings from backend — using local defaults');
  }
}

// ─── WS Interceptor — installed by Chrome via MAIN-world content_script ──────
// injected.js runs in the page's JS world at document_start and postMessages
// AVALISA_WS_* frames to this listener. No manual script-tag injection needed.
window.addEventListener('message', (e) => {
  const t = e.data?.type;
  if (t === 'AVALISA_WS') {
    parseWsMessage(e.data.data);
  } else if (t === 'AVALISA_WS_TICK') {
    // Binary Blob decoded: [[asset, timestamp, price], ...]
    try {
      const ticks = JSON.parse(e.data.data);
      if (Array.isArray(ticks)) {
        if (_tickLogCount < 5) {
          console.log('[Avalisa] WS_TICK sample:', JSON.stringify(ticks).substring(0, 300));
          _tickLogCount++;
        }
        ticks.forEach(tick => {
          if (Array.isArray(tick) && tick.length >= 3) {
            if (_tickLogCount < 10) {
              console.log('[Avalisa] TICK ingest: asset=', JSON.stringify(tick[0]), 'ts=', tick[1], 'price=', tick[2], '→ keys: ' + tick[0] + ':30, ' + tick[0] + ':60, ...');
              _tickLogCount++;
            }
            ingestTick(tick[0], tick[1], tick[2]);
          }
        });
      }
    } catch (_) {}
  } else if (t === 'AVALISA_WS_HISTORY') {
    console.log('[Avalisa] HISTORY binary received, length:', e.data.data.length);
    try {
      const parsed = JSON.parse(e.data.data);

      console.log('[Avalisa] HISTORY raw payload keys:', Object.keys(parsed || {}));
      console.log('[Avalisa] HISTORY raw payload sample:', JSON.stringify(parsed).substring(0, 800));
      if (parsed?.history) {
        const ticks = parsed.history;
        console.log('[Avalisa] HISTORY ticks:', ticks.length,
          'first:', JSON.stringify(ticks[0]),
          'last:', JSON.stringify(ticks[ticks.length - 1]),
          'span_seconds:', ticks.length > 1 ? Number(ticks[ticks.length-1][0]) - Number(ticks[0][0]) : 'n/a');
      }

      const pair = getCurrentPair();
      const asset = normalizeAssetName(pair) || 'UNKNOWN';
      const tf = state.settings?.timeframe || 'M1';
      const periodSec = TF_TO_SECONDS[tf] || 60;

      if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.history)) {
        // Format: {asset, period, history: [[ts_float, price_float], ...]}
        const histAsset = normalizeAssetName(parsed.asset) || asset;
        const rawPeriod = Number(parsed.period) || periodSec;
        const histPeriod = rawPeriod > 3600 ? rawPeriod / 1000 : rawPeriod; // normalize ms → sec if PO sends ms

        // Detect pair / period switch and wipe stale buffers from other pairs
        const pairChanged = state.activePair !== histAsset || state.activePeriod !== histPeriod;
        if (pairChanged) {
          clearStalePairBuffers(histAsset, histPeriod);
          state.activePair = histAsset;
          state.activePeriod = histPeriod;
          console.log('[Avalisa] Pair switch detected →', histAsset + ':' + histPeriod);
        }

        // REPLACE (not append) the buffer with bucketed candles from this seed
        const candleCount = seedCandleBufferFromHistory(histAsset, histPeriod, parsed.history);
        console.log('[Avalisa] HISTORY seeded', candleCount, 'candles for', histAsset + ':' + histPeriod,
          '(ticks:', parsed.history.length + ')');
        updateBottomStatus();
      } else if (Array.isArray(parsed)) {
        // Legacy array format
        let ingested = 0;
        parsed.forEach(item => {
          let candle = null;

          if (Array.isArray(item)) {
            if (ingested < 3) console.log('[Avalisa] HISTORY candle raw:', JSON.stringify(item));
            if (item.length >= 5) {
              candle = { time: item[0], open: item[1], high: item[3], low: item[4], close: item[2], asset, period: periodSec };
            } else if (item.length >= 4) {
              candle = { time: item[0], open: item[1], high: item[2], low: item[3], close: item[1], asset, period: periodSec };
            }
          } else if (item && typeof item === 'object') {
            if (ingested < 3) console.log('[Avalisa] HISTORY candle obj:', JSON.stringify(item));
            candle = {
              time: item.time || item.timestamp || item.t,
              open: item.open || item.o,
              high: item.high || item.h,
              low: item.low || item.l,
              close: item.close || item.c,
              asset, period: periodSec
            };
          }

          if (candle && candle.time && candle.open) {
            ingestCandle(candle);
            ingested++;
          }
        });
        // Legacy format: best-effort activePair assignment so getBufferedCandles works
        if (state.activePair !== asset || state.activePeriod !== periodSec) {
          clearStalePairBuffers(asset, periodSec);
          state.activePair = asset;
          state.activePeriod = periodSec;
        }
        console.log('[Avalisa] HISTORY ingested', ingested, 'candles for', asset + ':' + periodSec);
        updateBottomStatus();
      }
    } catch (err) {
      console.warn('[Avalisa] HISTORY parse error:', err, 'raw:', e.data.data.substring(0, 200));
    }
  } else if (t === 'AVALISA_WS_SEND') {
    // Log outgoing WS — helps identify what PO sends to trigger AI
    if (e.data.data && !e.data.data.startsWith('2') && !e.data.data.startsWith('3')) {
      console.log('[Avalisa] WS SEND:', e.data.data.substring(0, 300));
    }
  } else if (t === 'AVALISA_FETCH') {
    console.log('[Avalisa] FETCH', e.data.method, e.data.url, e.data.body ? '| body:' + e.data.body : '');
  } else if (t === 'AVALISA_FETCH_RES') {
    console.log('[Avalisa] FETCH_RES', e.data.url, '|', e.data.body);
  } else if (t === 'AVALISA_XHR') {
    console.log('[Avalisa] XHR', e.data.method, e.data.url, '|', e.data.response);
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  await loadFromStorage();
  await loadSettingsFromBackend();
  injectOverlay();
  loadAffiliateLink(); // fire-and-forget
  // Seed token status if logged in
  if (state.jwt) {
    apiGet('/api/ai/token-status').then(ts => {
      if (ts) {
        if (ts.remaining !== undefined) state.aiTokensRemaining = ts.remaining;
        if (ts.tokensLimit !== undefined) state.aiTokensLimit = ts.tokensLimit;
        if (ts.unlimited) state.aiUnlimited = true;
      }
      updateBottomStatus();
    }).catch(() => {});
  }
  setTimeout(() => prefillCandleHistory().catch(console.error), 3000);
  setInterval(updateBottomStatus, 10000);

  // Wait for PO header to render before injecting button
  const headerInterval = setInterval(() => {
    const header = document.querySelector('.header__right, .header-right, header');
    if (header) {
      injectHeaderButton();
      clearInterval(headerInterval);
    }
  }, 1000);
}

// Message listener — handles messages from popup and background
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'TOGGLE_PANEL') {
    const panel = document.getElementById('avalisa-overlay');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    sendResponse({ ok: true });
  }
});

// At document_start the DOM is never ready yet — always wait for DOMContentLoaded
document.addEventListener('DOMContentLoaded', init);

// ─── Debug helper — run window.avDebug() in PO devtools console ───────────────
window.avDebug = function () {
  const buf = state.candleBuffer || {};
  const allKeys = Object.keys(buf);
  const out = {
    version: chrome.runtime.getManifest().version,
    activePair: state.activePair,
    activePeriod: state.activePeriod,
    activeKey: `${state.activePair}:${state.activePeriod}`,
    bufferKeys: allKeys,
    bufferSizes: allKeys.reduce((acc, k) => { acc[k] = buf[k].length; return acc; }, {}),
    activeBufferSample: buf[`${state.activePair}:${state.activePeriod}`]?.slice(0, 3) || [],
    activeBufferLast: buf[`${state.activePair}:${state.activePeriod}`]?.slice(-3) || [],
    settings: state.settings,
    licenseInfo: state.licenseInfo,
    running: state.running,
    isTradeOpen: state.isTradeOpen,
    currentPair_DOM: getCurrentPair(),
    normalizedFromDOM: normalizeAssetName(getCurrentPair()),
  };
  console.log('[Avalisa Debug]', JSON.stringify(out, null, 2));
  return out;
};
console.log('[Avalisa] Debug helper ready — run window.avDebug() in PO console anytime');
