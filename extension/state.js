/**
 * Avalisa PO Bot v2 - Shared runtime state
 * Loaded before content.js by manifest order.
 */

const state = {
  running: false,
  isTradeOpen: false,
  tradeLock: false,
  tradeLockPhase: null,
  tradeLockSince: 0,
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
  lastTradeResultDebug: null,
  aiNoProgressCycles: 0,
  unconfirmedOrderFailures: 0,
  lastPairSwitchAt: 0,
  // Payout monitor (populated from chrome.storage.local)
  payoutMinPercent: 90,
  payoutAction: 'switch',
};

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
    aiPairMode: 'auto', // auto = scan payout-qualified favorites; current = never rotate pairs
  };
}

const MAX_CANDLE_BUFFER = 50;
// PO's updateHistoryNewFast seed commonly gives only 12-15 trade-duration
// candles right after page load. Gate by intensity: Low starts quickly, while
// Mid/High wait for more evidence. All modes keep/use up to 50 when available.
// Mid now allows OTC; High remains the strict OTC-filtered mode.
const REQUIRED_CANDLES_BY_INTENSITY = { low: 12, mid: 20, high: 30 };
const IDEAL_CANDLES = 50;
const AI_MAX_NO_PROGRESS_CYCLES = 3;
const AI_NO_PROGRESS_RETRY_MS = 5000;
const LATE_OPEN_WATCH_MS = 90000;
const MAX_UNCONFIRMED_ORDER_FAILURES = 3;
const CANDLE_CACHE_KEY = 'avalisaCandleCache';
let candleCacheSaveTimer = null;
