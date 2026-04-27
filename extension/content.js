/**
 * Avalisa PO Bot v2 — Content Script
 * Injected into pocketoption.com and po.cash
 * Uses DOM-click approach for maximum stability.
 */

// ─── WebSocket Candle Interceptor ─────────────────────────────────────────────
// injected.js is now loaded directly by Chrome as a MAIN-world content script
// (see manifest.json content_scripts[0]). The legacy <script src=...> approach
// was blocked by PO's CSP, which prevented the WebSocket wrapper from installing.

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
  // PO streams many numeric asset ids in the same socket. Charles should only
  // build candles for the active named pair; otherwise buffers balloon and AI
  // can accidentally reason over unrelated streams.
  const assetKey = String(asset);
  if (/^\d+$/.test(assetKey)) return;
  if (state.activePair && assetKey !== state.activePair) return;
  const periods = state.activePeriod ? [state.activePeriod] : Object.values(TF_TO_SECONDS);
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
  if (state.activePair && state.activePeriod) scheduleCandleCacheSave();
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

function getBufferedCandlesFor(asset, periodSec) {
  if (!asset || !periodSec) return [];
  return state.candleBuffer[`${asset}:${periodSec}`] || [];
}

function getCurrentAiIntensity() {
  const el = document.getElementById('av-intensity');
  if (el && ['low', 'mid', 'high'].includes(el.value)) return el.value;
  return ['low', 'mid', 'high'].includes(state.settings?.intensity) ? state.settings.intensity : 'mid';
}

function getRequiredCandles(intensity = getCurrentAiIntensity()) {
  return REQUIRED_CANDLES_BY_INTENSITY[intensity] || REQUIRED_CANDLES_BY_INTENSITY.mid;
}

function getDurationSecondsFromDom() {
  const el = document.querySelector('.block--expiration-inputs');
  if (!el) return null;
  const text = el.textContent || '';
  if (text.includes('UTC')) return null;
  const match = text.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const seconds = (+match[1] * 3600) + (+match[2] * 60) + (+match[3]);
  return seconds > 0 && seconds <= 3600 ? seconds : null;
}

function getCurrentPeriodSeconds(fallbackTf = state.settings?.timeframe || 'M1') {
  return getDurationSecondsFromDom() || TF_TO_SECONDS[fallbackTf] || 60;
}

function isFreshCandleCache(candles, periodSec) {
  if (!Array.isArray(candles) || candles.length === 0) return false;
  const last = candles[candles.length - 1];
  if (!last || !Number.isFinite(last.time)) return false;
  const maxAgeSec = Math.max(periodSec * 6, 120);
  return (Date.now() / 1000) - last.time <= maxAgeSec;
}

async function restoreCandleCache(asset, periodSec) {
  if (!asset || asset === 'UNKNOWN' || !periodSec || typeof chrome === 'undefined' || !chrome.storage?.local) return false;
  return new Promise(resolve => {
    chrome.storage.local.get([CANDLE_CACHE_KEY], data => {
      const cache = data[CANDLE_CACHE_KEY] || {};
      const key = `${asset}:${periodSec}`;
      const candles = cache[key]?.candles || [];
      if (!isFreshCandleCache(candles, periodSec)) return resolve(false);

      clearStalePairBuffers(asset, periodSec);
      state.activePair = asset;
      state.activePeriod = periodSec;
      state.candleBuffer[key] = candles.slice(-MAX_CANDLE_BUFFER);
      console.log('[Avalisa] Restored cached candles for', key, 'count:', state.candleBuffer[key].length);
      updateBottomStatus();
      resolve(true);
    });
  });
}

function saveActiveCandleCache() {
  if (!state.activePair || !state.activePeriod || typeof chrome === 'undefined' || !chrome.storage?.local) return;
  const key = `${state.activePair}:${state.activePeriod}`;
  const candles = state.candleBuffer[key];
  if (!Array.isArray(candles) || candles.length === 0) return;

  chrome.storage.local.get([CANDLE_CACHE_KEY], data => {
    const cache = data[CANDLE_CACHE_KEY] || {};
    cache[key] = {
      savedAt: Date.now(),
      asset: state.activePair,
      period: state.activePeriod,
      candles: candles.slice(-MAX_CANDLE_BUFFER),
    };

    const pruned = Object.fromEntries(
      Object.entries(cache)
        .sort((a, b) => (b[1]?.savedAt || 0) - (a[1]?.savedAt || 0))
        .slice(0, 8)
    );
    chrome.storage.local.set({ [CANDLE_CACHE_KEY]: pruned });
  });
}

function scheduleCandleCacheSave() {
  if (candleCacheSaveTimer) return;
  candleCacheSaveTimer = setTimeout(() => {
    candleCacheSaveTimer = null;
    saveActiveCandleCache();
  }, 1000);
}

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
  scheduleCandleCacheSave();
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
    // v2.3.2: mirror to chrome.storage.local so popup.js renders correct plan/trades.
    try { chrome.storage.local.set({ licenseInfo: data }); } catch (_) {}
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

function classifyResultFromBalance(balanceBefore, balanceDuringTrade, balanceNow, amount, iteration, elapsedMs = iteration * 500) {
  if (balanceNow === null) return null;

  const settleTolerance = Math.max(0.15, amount * 0.15);
  const tieTolerance = Math.max(0.05, amount * 0.05); // ±5% of stake (balanceBefore tier — tight)
  const tieToleranceDuring = Math.max(0.10, amount * 0.10); // ±10% of stake (during tier — looser)
  const enoughTieTime = iteration >= 4 || elapsedMs >= 4000;
  const enoughLossTime = iteration >= 10 || elapsedMs >= 10000;

  if (balanceBefore !== null) {
    const deltaFromBefore = balanceNow - balanceBefore;

    // TIE: balance returned to pre-trade level (stake refunded, no profit/loss)
    if (enoughTieTime && Math.abs(deltaFromBefore) <= tieTolerance) {
      return { result: 'tie', detail: `balance returned to pre-trade level (${deltaFromBefore.toFixed(2)})` };
    }

    if (deltaFromBefore > amount * 0.5) {
      return { result: 'win', detail: `balance vs before +${deltaFromBefore.toFixed(2)}` };
    }
    // v2.3.4: iteration guard prevents false LOSS at iter 0 when PO balance display
    // is delayed and still shows balanceDuringTrade (= balanceBefore - amount).
    // Without this, winning trades whose balance hasn't refreshed yet were misread
    // as losses, laddering martingale on real wins (Oil screenshot 2026-04-26).
    if (enoughLossTime && deltaFromBefore < -(amount * 0.5)) {
      return { result: 'loss', detail: `balance vs before ${deltaFromBefore.toFixed(2)}` };
    }
  }

  if (balanceDuringTrade !== null) {
    const deltaFromDuring = balanceNow - balanceDuringTrade;

    // TIE at this tier: stake was deducted at open and restored at close → delta ≈ +amount
    // MUST check before win branch or tie would be misread as win.
    if (enoughTieTime && Math.abs(deltaFromDuring - amount) <= tieToleranceDuring) {
      return { result: 'tie', detail: `stake returned vs during (${deltaFromDuring.toFixed(2)} ≈ ${amount.toFixed(2)})` };
    }

    // WIN: stake + profit → delta > ~1.1x stake (excludes tie zone)
    if (deltaFromDuring > amount * 1.1) {
      return { result: 'win', detail: `balance vs during +${deltaFromDuring.toFixed(2)}` };
    }

    // LOSS: stake kept, balance didn't move from trade-open level
    if (enoughLossTime && Math.abs(deltaFromDuring) <= settleTolerance) {
      return { result: 'loss', detail: `balance stayed near trade-open balance (${deltaFromDuring.toFixed(2)})` };
    }
  }

  return null;
}

async function resolveTradeResult(balanceBefore, balanceDuringTrade, amount, tradeStartTs, preTradeSignatures) {
  const resolveStartTs = Date.now();
  const debug = {
    startedAt: new Date(tradeStartTs).toISOString(),
    amount,
    balanceBefore,
    balanceDuringTrade,
    samples: [],
    method: null,
    result: null,
    detail: null,
  };

  for (let i = 0; i < 80; i++) {
    const wsResult = readWsTradeResultSince(tradeStartTs);
    if (wsResult) {
      console.log('[Avalisa] RESULT:', wsResult.result.toUpperCase(), 'via WS event:', wsResult.event);
      state.lastTradeResultDebug = { ...debug, method: 'ws', result: wsResult.result, detail: wsResult.event };
      return wsResult.result;
    }

    const balanceNow = await getBalance();
    debug.samples.push({
      i,
      ts: Date.now(),
      balanceNow,
      deltaFromBefore: balanceBefore !== null && balanceNow !== null ? +(balanceNow - balanceBefore).toFixed(2) : null,
      deltaFromDuring: balanceDuringTrade !== null && balanceNow !== null ? +(balanceNow - balanceDuringTrade).toFixed(2) : null,
    });
    if (debug.samples.length > 20) debug.samples.shift();

    const balanceResult = classifyResultFromBalance(balanceBefore, balanceDuringTrade, balanceNow, amount, i, Date.now() - resolveStartTs);
    if (balanceResult) {
      console.log(`[Avalisa] RESULT: ${balanceResult.result.toUpperCase()} via ${balanceResult.detail}`);
      state.lastTradeResultDebug = { ...debug, method: 'balance', result: balanceResult.result, detail: balanceResult.detail };
      return balanceResult.result;
    }

    // DOM deal rows are a fallback only. PO may reorder or mutate the list,
    // and reading a previous row causes exactly the wrong martingale behavior:
    // win→ladder or loss→reset. Wait for balance/WS first.
    if (i >= 20) {
      const domResult = findResolvedNewDealResult(preTradeSignatures);
      if (domResult) {
        console.log(`[Avalisa] RESULT: ${domResult.result.toUpperCase()} via late DOM deal scrape (${domResult.signature})`);
        state.lastTradeResultDebug = { ...debug, method: 'dom-late', result: domResult.result, detail: domResult.signature };
        return domResult.result;
      }
    }

    await sleep(500);
  }

  // Inconclusive after waiting through WS + DOM + balance settling.
  // Unknown is safest: holds current stake, repeats trade, doesn't advance or reset martingale.
  // Better to under-bet a real loss than to ladder up on a real win or wipe recovery on a real loss.
  console.warn('[Avalisa] RESULT: UNKNOWN (inconclusive after all tiers — holding martingale state)');
  state.lastTradeResultDebug = { ...debug, method: 'inconclusive', result: 'unknown', detail: 'holding martingale state' };
  return 'unknown';
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
    return null;
  }

  // Switch to duration panel if UTC clock panel is showing
  await ensureDurationPanel();

  // Already set?
  const valEl = document.querySelector('.block--expiration-inputs .value__val');
  const current = valEl?.textContent?.trim();
  if (current === targetTime) {
    console.log('[Avalisa] setTimeframe: already set to', tf);
    return tf;
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
  const clickItem = async (item, selectedTf, reason) => {
    item.click();
    console.log('[Avalisa] setTimeframe:', reason, selectedTf);
    await sleep(300);
    closePOPopovers();
    await sleep(700);
    return selectedTf;
  };

  for (const item of items) {
    const text = item.textContent.trim();
    if (text === tf) {
      return clickItem(item, tf, 'clicked grid item');
    }
  }

  // Fallback: match on HH:MM:SS time string
  for (const item of items) {
    const text = item.textContent.trim();
    if (text === targetTime) {
      return clickItem(item, tf, 'clicked item by time string');
    }
  }

  const fallbackTf = chooseAvailableTimeframeFallback(tf, items);
  if (fallbackTf) {
    const fallbackTime = tfTimeMap[fallbackTf];
    for (const item of items) {
      const text = item.textContent.trim();
      if (text === fallbackTf || text === fallbackTime) {
        console.warn('[Avalisa] setTimeframe: requested option unavailable, falling back', tf, '→', fallbackTf);
        return clickItem(item, fallbackTf, 'clicked fallback item');
      }
    }
  }

  console.warn('[Avalisa] setTimeframe: could not find option for', tf,
    '| items found:', items.length,
    '| texts:', Array.from(items).map(i => i.textContent.trim()));
  if (trigger) trigger.click(); // close dropdown
  return null;
}

function chooseAvailableTimeframeFallback(preferredTf, items) {
  const tfTimeMap = {
    S30: '00:00:30',
    M1:  '00:01:00', M3:  '00:03:00',
    M5:  '00:05:00', M30: '00:30:00',
    H1:  '01:00:00',
  };
  const fallbackOrder = {
    S30: ['M1', 'M3', 'M5'],
    M1: ['S30', 'M3', 'M5'],
    M3: ['M1', 'M5', 'S30'],
    M5: ['M3', 'M1', 'S30'],
    M30: ['M5', 'M3', 'M1'],
    H1: ['M30', 'M5', 'M3', 'M1'],
  };
  const texts = new Set(Array.from(items || []).map(item => item.textContent.trim()));
  const choices = fallbackOrder[preferredTf] || ['M1', 'M3', 'M5', 'S30'];
  return choices.find(candidate => texts.has(candidate) || texts.has(tfTimeMap[candidate])) || null;
}

function closePOPopovers() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  document.body?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  document.querySelector('.chart-container, .trading-chart, main, body')?.click();
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
  const tf = state.settings?.timeframe || 'M1';
  const settingsMs = (TF_TO_SECONDS[tf] || 60) * 1000;
  const domSeconds = getDurationSecondsFromDom();
  if (domSeconds) {
    const domMs = domSeconds * 1000;
    console.log('[Avalisa] Expiry from DOM:', domSeconds + 's | from settings:', settingsMs / 1000 + 's');
    return domMs;
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
function countDealElements() {
  const DEAL_SELECTORS = [
    '.deal', '.deals-list__item', '.active-trade',
    '[class*="deal-timer"]', '[class*="deals-list"] [class*="item"]', '.trade-result',
  ];
  let count = 0;
  for (const sel of DEAL_SELECTORS) {
    count += document.querySelectorAll(sel).length;
  }
  return count;
}

async function waitForTradeOpen(balanceBefore, amount, timeoutMs = 10000, dealCountBefore = null) {
  const threshold = balanceBefore - (amount * 0.3);
  const beforeCount = Number.isFinite(dealCountBefore) ? dealCountBefore : countDealElements();
  let sawNewDealElement = false;
  let lastBalance = balanceBefore;

  await sleep(1500); // give PO time to process click
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    // Weak signal only: PO can leave stale/animated deal rows around. Log it,
    // but never treat DOM alone as proof that a trade opened.
    const dealCountNow = countDealElements();
    if (!sawNewDealElement && dealCountNow > beforeCount) {
      sawNewDealElement = true;
      console.log('[Avalisa] Trade DOM hint (count:', beforeCount, '→', dealCountNow, ') — waiting for balance deduction');
    }

    // Strong signal: stake is deducted from demo/real balance.
    const bal = await getBalance();
    if (bal !== null) lastBalance = bal;
    if (bal !== null && bal <= threshold) {
      console.log('[Avalisa] Trade confirmed via balance drop:', balanceBefore, '→', bal);
      return { opened: true, balanceDuring: bal, method: 'balance-drop' };
    }

    await sleep(250);
  }

  const finalBal = await getBalance();
  console.warn('[Avalisa] waitForTradeOpen: no balance deduction — not counting trade. balance:', finalBal, 'was:', balanceBefore, 'domHint:', sawNewDealElement);
  return {
    opened: false,
    balanceDuring: finalBal ?? lastBalance ?? balanceBefore,
    method: sawNewDealElement ? 'dom-no-balance-drop' : 'timeout-no-balance-drop',
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
  const seenNames = new Set();
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
      const key = normalizeAssetName(name);
      if (name && payout !== null && !seenNames.has(key)) {
        seenNames.add(key);
        results.push({ name, payout, el: node });
      }
    });
    if (results.length > 0) break;
  }
  return results;
}

function clickFavoritePair(fav) {
  if (!fav || !fav.el) return false;
  try {
    fav.el.click();
    state.lastPairSwitchAt = Date.now();
    setTimeout(closePOPopovers, 400);
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
async function checkPayoutBeforeTrade(options = {}) {
  const allowSwitch = options.allowSwitch !== false;
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

  if (!allowSwitch) {
    console.log('[Avalisa] Payout Monitor: auto-switch suppressed by current-pair AI mode');
    return { proceed: true };
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

// ─── Charles AI Opportunity Scanner ─────────────────────────────────────────
async function ensureCharlesDataForCurrentPair(timeoutMs = 6000, requiredCandles = getRequiredCandles()) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const asset = normalizeAssetName(getCurrentPair());
    const periodSec = getCurrentPeriodSeconds();
    if (asset && asset !== 'UNKNOWN' && periodSec) {
      await restoreCandleCache(asset, periodSec);
      requestCandleHistory(asset, periodSec, true);
      const activeReady = state.activePair === asset && state.activePeriod === periodSec;
      const activeCount = activeReady ? getBufferedCandlesFor(asset, periodSec).length : 0;
      if (activeCount >= requiredCandles) return true;
    }
    await sleep(500);
  }
  return getBufferedCandles().length >= requiredCandles;
}

function evaluateCharlesCurrentPair(intensity, payout = null, source = 'current') {
  const candles = getBufferedCandles();
  const requiredCandles = getRequiredCandles(intensity);
  if (candles.length < requiredCandles) {
    return {
      source,
      action: 'SKIP',
      reason: `loading_${candles.length}_${requiredCandles}`,
      candleCount: candles.length,
    };
  }

  const tf = SECONDS_TO_TF[state.activePeriod] || `${state.activePeriod}s`;
  const indicators = buildIndicators(candles, state.activePair, tf);
  if (!indicators) {
    return { source, action: 'SKIP', reason: 'missing_indicators', candleCount: candles.length };
  }

  const sig = globalThis.AvalisaSignalEngine.evaluateSignal(indicators, intensity);
  const confidence = sig.snapshot?.confidence || 0;
  const payoutBonus = Number.isFinite(payout) ? Math.max(0, payout - (state.payoutMinPercent || 0)) / 2 : 0;
  const score = confidence + payoutBonus;
  return {
    source,
    asset: state.activePair,
    period: state.activePeriod,
    payout,
    indicators,
    sig,
    action: sig.action,
    reason: sig.reason || 'ok',
    confidence,
    score,
    timeframe: sig.timeframe || tf,
    candleCount: candles.length,
  };
}

function isCharlesNoProgressReason(reason) {
  return /^loading_\d+_\d+$/.test(String(reason || '')) ||
    ['otc_filter', 'no_ready_favorite', 'no_favorite_signal', 'no_favorites_above_payout'].includes(reason);
}

function stopCharlesForDecision(message) {
  console.warn('[Avalisa] Charles stopping for decision:', message);
  state.running = false;
  state.stopRequested = true;
  clearTradeLock();
  updateUI();
  updateStatus('error', message);
}

async function chooseCharlesOpportunity(intensity, generation) {
  if (state.tradeLock || state.isTradeOpen) {
    return { source: 'current', action: 'SKIP', reason: state.tradeLockPhase || 'trade_open' };
  }

  const { minPct } = getPayoutSettings();
  const currentPayout = getCurrentPayoutPercent();

  const requiredCandles = getRequiredCandles(intensity);
  await ensureCharlesDataForCurrentPair(6000, requiredCandles);
  const current = evaluateCharlesCurrentPair(intensity, currentPayout, 'current');
  console.log(`[Avalisa] Charles scan current: action=${current.action} pair=${current.asset} payout=${current.payout ?? 'n/a'} confidence=${current.confidence || 0} tf=${current.timeframe || 'n/a'} reason=${current.reason}`);
  if (current.action !== 'SKIP') return current;

  if (state.settings?.aiPairMode === 'current') {
    return { ...current, reason: current.reason || 'current_pair_only' };
  }

  const favorites = getFavoritePairs()
    .filter(f => Number.isFinite(f.payout) && f.payout >= minPct)
    .sort((a, b) => b.payout - a.payout)
    .slice(0, AI_SCAN_MAX_FAVORITES);

  if (favorites.length === 0) {
    return { ...current, reason: current.reason || 'no_favorites_above_payout' };
  }

  let sawLoadingCandidate = false;
  for (const fav of favorites) {
    if (!state.running || state.stopRequested || generation !== state.cycleGeneration) return current;
    updateStatus('running', `Scanning ${fav.name} (${fav.payout}%)`);
    console.log(`[Avalisa] Charles scan: switching to favorite ${fav.name} (${fav.payout}%)`);
    if (!clickFavoritePair(fav)) continue;
    await sleep(1800);
    await ensureCharlesDataForCurrentPair(7000, requiredCandles);
    const candidate = evaluateCharlesCurrentPair(intensity, fav.payout, 'favorite');
    candidate.favoriteName = fav.name;
    console.log(`[Avalisa] Charles scan favorite: action=${candidate.action} pair=${candidate.asset} favorite=${fav.name} payout=${fav.payout} confidence=${candidate.confidence || 0} tf=${candidate.timeframe || 'n/a'} reason=${candidate.reason}`);
    if (candidate.action !== 'SKIP') return candidate;
    if (/^loading_\d+_\d+$/.test(candidate.reason || '')) sawLoadingCandidate = true;
  }

  return { ...current, reason: sawLoadingCandidate ? 'no_ready_favorite' : 'no_favorite_signal' };
}

// ─── Trading Engine ───────────────────────────────────────────────────────────
function isCycleActive(generation) {
  return state.running && !state.stopRequested && generation === state.cycleGeneration;
}

function setTradeLock(phase) {
  state.tradeLock = true;
  state.tradeLockPhase = phase || 'trade_open';
  state.tradeLockSince = Date.now();
  state.isTradeOpen = true;
}

function clearTradeLock() {
  state.tradeLock = false;
  state.tradeLockPhase = null;
  state.tradeLockSince = 0;
  state.isTradeOpen = false;
}

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
  if (!isCycleActive(generation)) return;

  if (state.tradeLock || state.isTradeOpen) {
    console.log('[Avalisa] Trade locked, waiting...', state.tradeLockPhase || 'trade_open');
    updateStatus('running', 'Trade locked — waiting...');
    await sleep(3000);
    if (isCycleActive(generation)) runTradeCycle(generation).catch(err => console.error('[Avalisa] Cycle error:', err));
    return;
  }

  // License check
  const license = await checkLicense();
  if (!isCycleActive(generation)) return;
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
    const pay = await checkPayoutBeforeTrade({
      allowSwitch: !(state.settings.strategy === 'ai' && state.settings.aiPairMode === 'current'),
    });
    if (!isCycleActive(generation)) return;
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
    const intensity = state.settings.intensity || state.settings.aiIntensity || 'mid';
    const requiredCandles = getRequiredCandles(intensity);
    let candles = getBufferedCandles();
    let warmupTries = 0;
    let lastCount = candles.length;
    while (candles.length < requiredCandles && state.running && !state.stopRequested) {
      updateStatus('running', `Loading: ${candles.length}/${requiredCandles}`);
      const asset = normalizeAssetName(getCurrentPair());
      const periodSec = getCurrentPeriodSeconds();
      requestCandleHistory(asset, periodSec, true);
      await sleep(2000);
      if (!isCycleActive(generation)) return;
      candles = getBufferedCandles();
      warmupTries = candles.length > lastCount ? 0 : warmupTries + 1;
      lastCount = candles.length;
      if (warmupTries >= AI_MAX_NO_PROGRESS_CYCLES) {
        if (state.settings.aiPairMode === 'current') {
          state.aiNoProgressCycles = (state.aiNoProgressCycles || 0) + 1;
          updateStatus('running', `Waiting for candles: ${candles.length}/${requiredCandles} — retrying (${state.aiNoProgressCycles})`);
          await sleep(AI_NO_PROGRESS_RETRY_MS);
          if (isCycleActive(generation)) runTradeCycle(generation).catch(console.error);
          return;
        }
        console.warn('[Avalisa] Charles warmup stalled — scanning favorites instead:', candles.length, '/', requiredCandles);
        updateStatus('running', `Loading stalled (${candles.length}/${requiredCandles}) — scanning favorites`);
        break;
      }
    }
    if (!isCycleActive(generation)) return;

    // v2.3.1: settings field is `intensity` (set in saveCurrentSettings/dropdown), not `aiIntensity`.
    // Old code always fell through to 'mid' regardless of user's Low/High pick.
    const opportunity = await chooseCharlesOpportunity(intensity, generation);
    if (!isCycleActive(generation)) return;
    const sig = opportunity?.sig || { action: 'SKIP', reason: opportunity?.reason || 'no_signal' };
    aiSignalSnapshot = sig.snapshot || null;
    aiSuggestedTimeframe = opportunity?.timeframe || sig.timeframe || null;

    console.log(`[Avalisa] Charles selected: action=${sig.action} pair=${opportunity?.asset || getCurrentPair()} source=${opportunity?.source || 'current'} confidence=${opportunity?.confidence || 0} tf=${aiSuggestedTimeframe || 'n/a'} reason=${sig.reason || opportunity?.reason || 'ok'} rules=${sig.snapshot?.rulesMatched}`);

    if (sig.action === 'SKIP') {
      const reason = sig.reason || opportunity?.reason || 'no_signal';
      const noProgressReason = isCharlesNoProgressReason(reason);
      if (noProgressReason) {
        state.aiNoProgressCycles = (state.aiNoProgressCycles || 0) + 1;
      } else {
        state.aiNoProgressCycles = 0;
      }
      // SKIP: re-check soon, using the live PO duration as the retry clock.
      const candleMs = getCurrentPeriodSeconds() * 1000;
      const retryMs = noProgressReason ? 5000 : Math.min(candleMs, 30000);
      // v2.3.2: friendlier OTC message — Mid/High intensity skips OTC by design.
      const skipMsg = reason === 'otc_filter'
        ? `SKIP — OTC pair (use Low intensity) — retrying (${state.aiNoProgressCycles || 0})`
        : `SKIP (${reason}) — scanning again (${state.aiNoProgressCycles || 0})`;
      updateStatus('running', skipMsg);
      await sleep(retryMs);
      if (isCycleActive(generation)) {
        runTradeCycle(generation).catch(console.error);
      }
      return;
    }
    state.aiNoProgressCycles = 0;
    aiDecidedDirection = sig.action === 'CALL' ? 'call' : 'put';
  }

  const amount = state.currentAmount;
  if (!amount || amount <= 0) {
    state.currentAmount = parseFloat(state.settings.startAmount) || 1.0;
  }
  const safeAmount = state.currentAmount;

  const direction = aiDecidedDirection || getNextDirection();

  updateStatus('running', `Trade #${state.tradesCount + 1} — ${direction.toUpperCase()} $${safeAmount.toFixed(2)}`);

  // AI mode now executes on Charles' selected duration. Martingale still uses
  // the saved bot timeframe setting from the extension panel.
  let executionTimeframe = state.settings?.timeframe || 'M1';
  if (state.settings.strategy === 'ai') {
    const requestedTf = aiSuggestedTimeframe && TF_TO_SECONDS[aiSuggestedTimeframe]
      ? aiSuggestedTimeframe
      : (SECONDS_TO_TF[getCurrentPeriodSeconds()] || 'M1');
    const selectedTf = await setTimeframe(requestedTf);
    if (!selectedTf) {
      updateStatus('running', `Timeframe ${requestedTf} unavailable — retrying`);
      await sleep(AI_NO_PROGRESS_RETRY_MS);
      if (isCycleActive(generation)) runTradeCycle(generation).catch(console.error);
      return;
    }
    executionTimeframe = selectedTf;
    if (selectedTf !== requestedTf) {
      const asset = normalizeAssetName(getCurrentPair());
      const periodSec = TF_TO_SECONDS[selectedTf] || getCurrentPeriodSeconds(selectedTf);
      requestCandleHistory(asset, periodSec, true);
      updateStatus('running', `${requestedTf} unavailable — using ${selectedTf}, rescanning`);
      await sleep(1500);
      if (isCycleActive(generation)) runTradeCycle(generation).catch(console.error);
      return;
    }
  } else {
    const requestedTf = state.settings.timeframe || 'M1';
    const selectedTf = await setTimeframe(requestedTf);
    if (!selectedTf) {
      updateStatus('running', `Timeframe ${requestedTf} unavailable — retrying`);
      await sleep(AI_NO_PROGRESS_RETRY_MS);
      if (isCycleActive(generation)) runTradeCycle(generation).catch(console.error);
      return;
    }
    executionTimeframe = selectedTf;
    if (selectedTf !== requestedTf) {
      state.settings.timeframe = selectedTf;
      const tfEl = document.getElementById('av-timeframe');
      if (tfEl) tfEl.value = selectedTf;
      updateStatus('running', `${requestedTf} unavailable — using ${selectedTf}`);
    }
  }
  if (!isCycleActive(generation)) return;

  if (!setTradeAmount(safeAmount)) {
    if (!isCycleActive(generation)) return;
    updateStatus('error', 'Could not set trade amount — page may have changed');
    return;
  }

  // PO can accept a favorite/timeframe click visually before its trade controls
  // are fully ready. Give pair switches a short settle window before order click.
  const pairSwitchAge = state.lastPairSwitchAt ? Date.now() - state.lastPairSwitchAt : Infinity;
  if (pairSwitchAge < 2500) await sleep(2500 - pairSwitchAge);
  await sleep(700);
  if (!isCycleActive(generation)) return;

  await sleep(500);
  if (!isCycleActive(generation)) return;
  const balanceBefore = await getBalance();
  if (!isCycleActive(generation)) return;
  console.log('[Avalisa] Balance before trade:', balanceBefore);

  const expiryMs = getExpiryMs();

  const preTradeSignatures = getLatestDealSignatures();
  const preTradeDealCount = countDealElements();
  console.log('[Avalisa] pre-trade deal signatures:', preTradeSignatures);

  const tradeStartTs = Date.now();
  closePOPopovers();
  await sleep(200);
  if (!isCycleActive(generation)) return;
  const placed = direction === 'call' ? clickCall() : clickPut();
  if (!placed) {
    if (!isCycleActive(generation)) return;
    updateStatus('error', `Could not find ${direction.toUpperCase()} button`);
    return;
  }

  setTradeLock('order_pending');
  updateStatus('running', 'Order sent — confirming open...');

  // PO can delay stake deduction under load/background throttling. Waiting
  // longer is safer than retrying while a first click may still become live.
  let openResult = await waitForTradeOpen(balanceBefore, safeAmount, 45000, preTradeDealCount);
  if (!isCycleActive(generation)) return;
  if (!openResult.opened) {
    console.warn('[Avalisa] Trade click was not confirmed open — watching for a late PO open:', openResult.method);
    state.tradeLockPhase = `unconfirmed_${openResult.method}`;
    updateStatus('running', `Order not confirmed (${openResult.method}) — watching for late open`);
    openResult = await waitForTradeOpen(balanceBefore, safeAmount, LATE_OPEN_WATCH_MS, preTradeDealCount);
    if (!isCycleActive(generation)) return;
    if (!openResult.opened) {
      console.warn('[Avalisa] No late balance confirmation — clearing lock and continuing without counting trade:', openResult.method);
      clearTradeLock();
      const cooldownMs = Math.min(Math.max(getCurrentPeriodSeconds() * 1000, AI_NO_PROGRESS_RETRY_MS), 60000);
      updateStatus('running', `No confirmed order — cooling down ${Math.round(cooldownMs / 1000)}s`);
      await sleep(cooldownMs);
      if (isCycleActive(generation)) runTradeCycle(generation).catch(console.error);
      return;
    }
  }
  const balanceDuringTrade = openResult.balanceDuring;

  setTradeLock('trade_open');
  console.log('[Avalisa] Trade confirmed open. isTradeOpen = true. Balance during:', balanceDuringTrade, 'method:', openResult.method);

  const tradeGuardTimeout = setTimeout(() => {
    if (state.tradeLock || state.isTradeOpen) {
      console.warn('[Avalisa] Safety timeout — marking unknown and allowing resolver/loop to continue');
      state.tradeLockPhase = 'safety_timeout';
      updateStatus('running', 'Trade result delayed — resolving as unknown if needed');
    }
  }, expiryMs + 30000);

  state.tradesCount++;
  await incrementTrade();
  updateTradeCounter();

  updateStatus('running', `Trade open — waiting ${Math.round(expiryMs / 1000)}s for result…`);
  await sleep(expiryMs + 3000);

  clearTimeout(tradeGuardTimeout);
  state.tradeLockPhase = 'resolving_result';
  if (!isCycleActive(generation)) return;

  // 3-tier result detection: WS close event → DOM scrape → balance diff
  const result = await resolveTradeResult(balanceBefore, balanceDuringTrade, safeAmount, tradeStartTs, preTradeSignatures);
  const balanceAfter = await getBalance();
  if (!isCycleActive(generation)) return;

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
      timeframe: executionTimeframe
        ? executionTimeframe
        : (state.activePeriod ? `${state.activePeriod}s` : (state.settings?.timeframe || 'M1')),
      signalSnapshot: aiSignalSnapshot,
    })).catch(console.error);
  }

  applyMartingaleLogic(result);
  clearTradeLock();

  if (isCycleActive(generation)) {
    updateStatus('running', `Last: ${result.toUpperCase()} | Next: $${state.currentAmount.toFixed(2)}`);
    updateBottomStatus();
  }

  if (!isCycleActive(generation)) return;

  // AI mode: short delay (AI decides timing). Martingale mode: user delay.
  const delay = state.settings.strategy === 'ai' ? 1500 : (state.settings.delaySeconds || 6) * 1000;
  await sleep(delay);

  if (isCycleActive(generation)) {
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

  // TIE/UNKNOWN: hold current amount and step. Never ladder or reset on unclear data.
  if (result === 'tie' || result === 'unknown') {
    console.log(`[Avalisa] Martingale: result=${String(result).toUpperCase()} step=${state.martingaleStep} nextAmount=${state.currentAmount} (holding)`);
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

function applyStrategyUI(strategy) {
  const isAi = strategy === 'ai';
  const rowDirection = document.getElementById('av-row-direction');
  const rowTimeframe = document.getElementById('av-row-timeframe');
  const rowIntensity = document.getElementById('av-row-intensity');
  const rowAiPairMode = document.getElementById('av-row-ai-pair-mode');
  const rowPill = document.getElementById('av-row-bot-pill');

  if (rowDirection) rowDirection.style.display = isAi ? 'none' : 'flex';
  if (rowTimeframe) rowTimeframe.style.display = isAi ? 'none' : 'flex';
  if (rowIntensity) rowIntensity.style.display = isAi ? 'flex' : 'none';
  if (rowAiPairMode) rowAiPairMode.style.display = isAi ? 'flex' : 'none';
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
    if (strategy === 'ai') prefillCandleHistory().catch(console.error);
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
  ['av-direction', 'av-timeframe', 'av-multiplier', 'av-steps', 'av-intensity', 'av-ai-pair-mode'].forEach(id => {
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
let lastHistoryRequestKey = null;
let lastHistoryRequestAt = 0;

function requestCandleHistory(asset, periodSec, force = false) {
  if (!asset || asset === 'UNKNOWN' || !periodSec) return;
  const key = `${asset}:${periodSec}`;
  const now = Date.now();
  if (!force && lastHistoryRequestKey === key && now - lastHistoryRequestAt < 10000) return;
  lastHistoryRequestKey = key;
  lastHistoryRequestAt = now;
  window.postMessage({ type: 'AVALISA_REQUEST_HISTORY', asset, period: periodSec }, '*');
}

async function prefillCandleHistory() {
  const asset = normalizeAssetName(getCurrentPair());
  const periodSec = getCurrentPeriodSeconds();
  if (asset && asset !== 'UNKNOWN') {
    await restoreCandleCache(asset, periodSec);
    requestCandleHistory(asset, periodSec, true);
    console.log('[Avalisa] prefillCandleHistory: requested history for', asset + ':' + periodSec);
  } else {
    console.log('[Avalisa] prefillCandleHistory: waiting for active pair before requesting history');
  }
}

async function warmupCandleHistory(attempts = 3, delayMs = 1200) {
  const requiredCandles = getRequiredCandles();
  for (let i = 0; i < attempts; i++) {
    if (state.stopRequested) return;
    await prefillCandleHistory();
    if (getBufferedCandles().length >= requiredCandles) return;
    await sleep(delayMs);
  }
}

async function watchPOSelectionForCharles() {
  if (state.settings?.strategy !== 'ai' || state.running) return;
  const asset = normalizeAssetName(getCurrentPair());
  const periodSec = getCurrentPeriodSeconds();
  if (!asset || asset === 'UNKNOWN' || !periodSec) return;
  if (state.activePair === asset && state.activePeriod === periodSec) return;
  await restoreCandleCache(asset, periodSec);
  requestCandleHistory(asset, periodSec, true);
  updateBottomStatus();
}

// ─── Status Display ──────────────────────────────────────────────────────────
function updateBottomStatus() {
  const isAi = state.settings?.strategy === 'ai';

  // Idle AI status: reflect candle-buffer readiness in the main status line.
  // Skip while running — runTradeCycle drives the status text itself.
  if (isAi && !state.running) {
    const n = getBufferedCandles().length;
    const intensity = getCurrentAiIntensity();
    const requiredCandles = getRequiredCandles(intensity);
    if (n === 0) {
      updateStatus('', 'Waiting for pair data...');
    } else if (n < requiredCandles) {
      updateStatus('', `Loading: ${n}/${requiredCandles} (${intensity})`);
    } else {
      updateStatus('', `Ready (${n} candles, ${intensity})`);
    }
  }

  // Trade allowance — only visible when strategy=ai
  const tokenEl = document.getElementById('av-token-status');
  if (tokenEl) {
    const allowance = state.licenseInfo?.aiTradesAllowance;
    const usedCount = state.licenseInfo?.aiTradesUsed;
    // v2.3.2: Lifetime users see ∞ (the 100-cap is a backend default, not a hard product limit).
    if (isAi && state.licenseInfo?.plan === 'lifetime') {
      tokenEl.textContent = 'Trade allowance: ∞ (Lifetime)';
      tokenEl.style.display = '';
    } else if (isAi && Number.isFinite(allowance) && Number.isFinite(usedCount)) {
      tokenEl.textContent = `Trade allowance: ${usedCount}/${allowance}`;
      tokenEl.style.display = '';
    } else {
      tokenEl.style.display = 'none';
    }
  }
}

async function startBot() {
  if (state.running) return;

  const startGeneration = state.cycleGeneration + 1;
  state.cycleGeneration = startGeneration; // invalidates stale cycles and marks this pending start
  state.stopRequested = false;
  diagnosePOInterface();

  await saveCurrentSettings();
  if (state.stopRequested || state.cycleGeneration !== startGeneration) return;
  const license = await checkLicense();
  if (state.stopRequested || state.cycleGeneration !== startGeneration) return;

  if (!license.allowed) {
    showLimitReachedMessage(license);
    return;
  }

  state.running = true;
  clearTradeLock();                  // clear any stale open-trade flag from last run
  state.currentAmount = parseFloat(state.settings.startAmount) || 1.0;
  state.martingaleStep = 0;
  state.aiNoProgressCycles = 0;

  const gen = startGeneration;
  updateUI();
  updateStatus('running', 'Starting...');
  warmupCandleHistory().catch(console.error);
  runTradeCycle(gen);
}

function stopBot() {
  state.cycleGeneration++;           // invalidates any running cycle immediately
  state.running = false;
  state.stopRequested = true;
  clearTradeLock();
  state.aiNoProgressCycles = 0;
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
  const aiPairModeEl = document.getElementById('av-ai-pair-mode');
  const aiPairMode = aiPairModeEl && ['auto', 'current'].includes(aiPairModeEl.value)
    ? aiPairModeEl.value
    : (state.settings?.aiPairMode || 'auto');
  const multiplierRaw = parseFloat(document.getElementById('av-multiplier')?.value);
  const multiplier = Number.isFinite(multiplierRaw)
    ? multiplierRaw
    : (parseFloat(state.settings?.martingaleMultiplier) || 2.0);
  const selectedTimeframe = document.getElementById('av-timeframe')?.value;
  const settings = {
    strategy,
    // AI keeps the control hidden and follows its own/live signal duration.
    // Martingale still uses the user's explicit dropdown selection.
    timeframe: strategy === 'ai'
      ? (state.settings?.timeframe || 'S30')
      : (selectedTimeframe || state.settings?.timeframe || 'M1'),
    direction: document.getElementById('av-direction').value,
    delaySeconds: state.settings?.delaySeconds ?? 6,
    martingaleMultiplier: multiplier,
    martingaleSteps: document.getElementById('av-steps').value,
    startAmount: parseFloat(document.getElementById('av-start-amount').value) || 1.0,
    aiAssist: strategy === 'ai',
    intensity,
    aiPairMode,
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
    'av-strategy', 'av-direction', 'av-timeframe', 'av-intensity', 'av-ai-pair-mode',
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
    set('av-ai-pair-mode', ['auto', 'current'].includes(s.aiPairMode) ? s.aiPairMode : 'auto');

    // Apply AI/Martingale UI layout
    applyStrategyUI(s.strategy || 'martingale');

    // Payout Monitor values — read from dedicated top-level state (seeded from chrome.storage.local on init)
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
  // Preserve payout monitor top-level state — backend settings don't include these.
  const savedPayoutMinPercent = state.payoutMinPercent;
  const savedPayoutAction = state.payoutAction;
  const localAiPairMode = state.settings?.aiPairMode;
  try {
    const data = await apiGet('/api/settings');
    if (data && !data.error) {
      state.settings = {
        ...getDefaultSettings(),
        ...data,
        aiPairMode: ['auto', 'current'].includes(localAiPairMode)
          ? localAiPairMode
          : (['auto', 'current'].includes(data.aiPairMode) ? data.aiPairMode : getDefaultSettings().aiPairMode),
      };
      await new Promise(resolve => chrome.storage.local.set({ settings: state.settings }, resolve));
      console.log('[Avalisa] Settings loaded from backend');
    }
  } catch (err) {
    console.warn('[Avalisa] Could not load settings from backend — using local defaults');
  } finally {
    // Restore payout monitor values that were seeded from chrome.storage.local.
    state.payoutMinPercent = savedPayoutMinPercent;
    state.payoutAction = savedPayoutAction;
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
      const periodSec = getCurrentPeriodSeconds();

      if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.history)) {
        // Format: {asset, period, history: [[ts_float, price_float], ...]}
        const histAsset = normalizeAssetName(parsed.asset) || asset;
        // PO history can report its transport/tick granularity (often 5s),
        // while the user-selected trade duration is shown in the page UI.
        // Charles must follow the user-selected duration, not the transport
        // period, so feature additions do not override manual PO choices.
        const histPeriod = periodSec;

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
        scheduleCandleCacheSave();
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
    // v2.3.3: also seed licenseInfo on init — popup reads from chrome.storage,
    // and without this call licenseInfo only populated on Start (popup stuck showing FREE).
    checkLicense().then(lic => { state.licenseInfo = lic; updateUI(); }).catch(() => {});
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
  setInterval(() => watchPOSelectionForCharles().catch(console.error), 2000);

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
    tradeLock: state.tradeLock,
    tradeLockPhase: state.tradeLockPhase,
    tradeLockAgeMs: state.tradeLockSince ? Date.now() - state.tradeLockSince : 0,
    martingaleStep: state.martingaleStep,
    currentAmount: state.currentAmount,
    lastTradeResultDebug: state.lastTradeResultDebug,
    currentPair_DOM: getCurrentPair(),
    normalizedFromDOM: normalizeAssetName(getCurrentPair()),
  };
  console.log('[Avalisa Debug]', JSON.stringify(out, null, 2));
  return out;
};
console.log('[Avalisa] Debug helper ready — run window.avDebug() in PO console anytime');
