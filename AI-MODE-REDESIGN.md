# Avalisa PO Bot v2 — AI Mode Redesign: Zero-Token Rule Engine

**Status:** Research complete — ready for implementation  
**Date:** 2026-04-19  
**Goal:** Replace AI API calls with a local rule-based signal engine. Zero LLM tokens at runtime. "AI Mode" branding retained — rename to "Smart Signal Engine" in UI.

---

## Claude's Synthesis & Decisions

After reviewing all three research reports, here are the key architecture decisions:

### What stays
- "AI mode" as the premium/upsell feature label — just rebrand to "Smart Signal" or keep "AI-Powered"
- The existing `buildIndicators()` function — already computes 8 useful values
- The Martingale strategy option for users who want it (but not as AI mode default)
- The existing WS candle interceptor infrastructure

### What changes
- `/api/ai/signal` backend call → **eliminated**. Replaced by local `signalEngine.js`
- AI mode now runs zero network calls per trade cycle
- Signal criteria stored per-user in backend, synced to extension via `chrome.storage.sync`
- Dashboard gets a new "Strategy" tab to select preset + tune thresholds

### What to add (priority order)
1. **Bollinger Bands** — zero-cost: `upper = SMA20 + 2*stdev`, `lower = SMA20 - 2*stdev` (already have both values)
2. **Session filter** — time-of-day guard (13:00-17:00 UTC = best; skip 21:00-00:00)
3. **OTC pair warning** — alert user that OTC pairs are broker-synthetic; recommend live pairs
4. **Stochastic (K=5, D=3)** — add for crossover confirmation
5. **ADX(14)** — trend strength mode-switch (>25 = trend mode, <20 = range mode)

### What NOT to do (yet)
- Don't add CCI, Williams %R, MACD in v1 — complexity without proportional gain until basic system is validated on real trades
- Don't change the Martingale strategy for non-AI modes
- Don't touch the backend licensing or webhook system

---

## Mathematical Reality Check

At PocketOption's ~80% payout:

| Win Rate | Net ROI per 100 trades | Verdict |
|----------|----------------------|---------|
| 50% | -10% | Random, losing |
| 55% | -1% | Near-breakeven |
| 55.6% | 0% | Breakeven |
| 58% | +4.4% | Marginally profitable |
| 62% | +11.6% | Good edge |
| 65% | +17% | Strong edge |

**Target: 58–63% win rate**. Achievable with strict 3-condition confluence. Above 65% is usually overfit backtests.

**Martingale reality:** At 60% win rate, probability of 6 consecutive losses = 0.4^6 = 0.41%. Over 500 trades, this sequence occurs near-certainly and wipes the account. Flat 1–2% betting is the only mathematically sustainable approach.

---

## Architecture: Rule Engine

```
Dashboard (sets active preset + thresholds)
    ↓  PUT /api/signal-config
Backend (stores per-user JSON in AppConfig table)
    ↑  GET /api/signal-config  (polled every 60s)
Extension (caches in chrome.storage.sync)
    ↓  reads signalConfig on each trade cycle
signalEngine.js (pure JS — evaluateSignal(indicators, preset))
    → returns { signal: 'CALL'|'PUT'|'SKIP', reason, callScore, putScore }
```

**Zero AI tokens in this path.**

---

## New Indicators to Add to `buildIndicators()`

Add these to the existing return object in `content.js`:

```javascript
// ── Add to buildIndicators() return value ────────────────────────────────
// Bollinger Bands (zero-cost: SMA20 and stdev already computed above)
const upperBand = sma20 ? +(sma20 + 2 * vol).toFixed(5) : null;
const lowerBand = sma20 ? +(sma20 - 2 * vol).toFixed(5) : null;
const bbWidth   = (sma20 && upperBand && lowerBand)
  ? +(((upperBand - lowerBand) / sma20) * 100).toFixed(3) : null;
const priceVsUpperBandPct = (upperBand && price)
  ? +(((price - upperBand) / upperBand) * 100).toFixed(3) : null;
const priceVsLowerBandPct = (lowerBand && price)
  ? +(((price - lowerBand) / lowerBand) * 100).toFixed(3) : null;

// SMA10 vs SMA20 relationship
const sma10VsSma20Pct = (sma10 && sma20)
  ? +(((sma10 - sma20) / sma20) * 100).toFixed(3) : null;

// Candle body size (indecision filter)
const lastCandle = candles[candles.length - 1];
const lastCandleBodyPct = lastCandle
  ? +(Math.abs(lastCandle.close - lastCandle.open) /
      ((lastCandle.high - lastCandle.low) || 0.00001) * 100).toFixed(1) : null;

// Add to return object:
// upperBand, lowerBand, bbWidth, priceVsUpperBandPct, priceVsLowerBandPct,
// sma10VsSma20Pct, lastCandleBodyPct
```

---

## The Signal Engine: `signalEngine.js`

New file: `extension/signalEngine.js` — concatenated before `content.js` in build.

```javascript
// ── signalEngine.js ─────────────────────────────────────────────────────────
// Pure rule evaluator. No network calls. No side effects.
// Returns: { signal: 'CALL'|'PUT'|'SKIP', reason: string, callScore: number, putScore: number }

'use strict';

function evalRule(rule, ind) {
  const raw = ind[rule.indicator];
  if (raw === null || raw === undefined) return false;
  switch (rule.op) {
    case 'gt':      return raw > rule.value;
    case 'gte':     return raw >= rule.value;
    case 'lt':      return raw < rule.value;
    case 'lte':     return raw <= rule.value;
    case 'eq':      return raw === rule.value;
    case 'between': return raw >= rule.value[0] && raw <= rule.value[1];
    case 'pattern': {
      if (!Array.isArray(raw) || !Array.isArray(rule.value)) return false;
      if (raw.length !== rule.value.length) return false;
      return raw.every((v, i) => v === rule.value[i]);
    }
    case 'contains': {
      if (!Array.isArray(raw)) return false;
      const { item, count } = rule.value;
      return raw.filter(v => v === item).length >= count;
    }
    default:
      console.warn('[SignalEngine] Unknown op:', rule.op);
      return false;
  }
}

function evalGroup(group, ind) {
  if (!group || !Array.isArray(group.rules) || group.rules.length === 0) {
    return { pass: false, score: 0, total: 0 };
  }
  const results = group.rules.map(r => evalRule(r, ind));
  const passed  = results.filter(Boolean).length;
  const total   = results.length;
  let pass = false;
  switch ((group.logic || 'AND').toUpperCase()) {
    case 'AND':        pass = passed === total; break;
    case 'OR':         pass = passed >= 1; break;
    case 'MAJORITY':   pass = passed > total / 2; break;
    case 'CONFLUENCE': pass = passed >= (group.confluenceThreshold || Math.ceil(total / 2)); break;
    default:           pass = passed === total;
  }
  return { pass, score: passed, total };
}

function evaluateSignal(indicators, preset) {
  const minCandles = preset.minCandles || 20;
  if (!indicators || indicators.candleCount < minCandles) {
    return {
      signal: 'SKIP',
      reason: `Insufficient candles (${indicators?.candleCount ?? 0}/${minCandles})`,
      callScore: 0, putScore: 0,
    };
  }
  // Skip block — evaluated first, highest priority
  const skipResult = evalGroup(preset.skip, indicators);
  if (skipResult.pass) {
    return {
      signal: 'SKIP',
      reason: `Skip condition met (${skipResult.score}/${skipResult.total})`,
      callScore: 0, putScore: 0,
    };
  }
  const callResult = evalGroup(preset.call, indicators);
  const putResult  = evalGroup(preset.put,  indicators);
  // Both fire → higher confluence score wins; tie → SKIP
  if (callResult.pass && putResult.pass) {
    if (callResult.score > putResult.score)
      return { signal: 'CALL', reason: `CALL wins tie (${callResult.score} vs ${putResult.score})`, callScore: callResult.score, putScore: putResult.score };
    if (putResult.score > callResult.score)
      return { signal: 'PUT',  reason: `PUT wins tie (${putResult.score} vs ${callResult.score})`, callScore: callResult.score, putScore: putResult.score };
    return { signal: 'SKIP', reason: 'CALL/PUT tied — ambiguous', callScore: callResult.score, putScore: putResult.score };
  }
  if (callResult.pass)
    return { signal: 'CALL', reason: `CALL: ${callResult.score}/${callResult.total} rules`, callScore: callResult.score, putScore: putResult.score };
  if (putResult.pass)
    return { signal: 'PUT',  reason: `PUT: ${putResult.score}/${putResult.total} rules`, callScore: callResult.score, putScore: putResult.score };
  return {
    signal: 'SKIP',
    reason: `No signal (CALL: ${callResult.score}/${callResult.total}, PUT: ${putResult.score}/${putResult.total})`,
    callScore: callResult.score, putScore: putResult.score,
  };
}
```

---

## Four Built-In Strategy Presets

### Default Preset Config (hardcode in extension as fallback)

```javascript
const DEFAULT_SIGNAL_CONFIG = {
  schemaVersion: 1,
  activePreset: 'mean_reversion',
  presets: {

    // ── Preset 1: Mean Reversion (Best with existing indicators) ──────────
    // Target win rate: 63–68% in ranging markets
    // Best on: EUR/USD, GBP/USD live pairs | Asian session ranging
    mean_reversion: {
      id: 'mean_reversion',
      label: 'Mean Reversion',
      description: 'Fade RSI extremes when price stretches far from SMA20',
      minCandles: 20,
      skip: {
        logic: 'OR',
        rules: [
          { indicator: 'volatility',        op: 'gt',      value: 0.0025 },
          { indicator: 'priceVsSma20Pct',   op: 'between', value: [-0.1, 0.1] },
          { indicator: 'lastCandleBodyPct', op: 'lt',      value: 20 },   // doji/indecision
          { indicator: 'candleCount',       op: 'lt',      value: 20 }
        ]
      },
      call: {
        logic: 'AND',
        rules: [
          { indicator: 'priceVsSma20Pct',  op: 'lt',      value: -0.3 },
          { indicator: 'rsi14',            op: 'lt',      value: 30 },
          { indicator: 'rangeFromLowPct',  op: 'lt',      value: 20 },
          { indicator: 'momentum5',        op: 'between', value: [-1.0, -0.1] }
        ]
      },
      put: {
        logic: 'AND',
        rules: [
          { indicator: 'priceVsSma20Pct',  op: 'gt',      value: 0.3 },
          { indicator: 'rsi14',            op: 'gt',      value: 70 },
          { indicator: 'rangeFromLowPct',  op: 'gt',      value: 80 },
          { indicator: 'momentum5',        op: 'between', value: [0.1, 1.0] }
        ]
      }
    },

    // ── Preset 2: RSI Reversal (Candle pattern + RSI extremes) ────────────
    // Target win rate: 61–66%
    // Best on: 1m-5m | Requires 3 consecutive same-direction candles
    rsi_reversal: {
      id: 'rsi_reversal',
      label: 'RSI Reversal',
      description: 'Fade 3-candle exhaustion moves at RSI extremes',
      minCandles: 20,
      skip: {
        logic: 'OR',
        rules: [
          { indicator: 'volatility',        op: 'gt', value: 0.003 },
          { indicator: 'lastCandleBodyPct', op: 'lt', value: 20 },
          { indicator: 'candleCount',       op: 'lt', value: 20 }
        ]
      },
      call: {
        logic: 'AND',
        rules: [
          { indicator: 'rsi14',           op: 'lt',      value: 30 },
          { indicator: 'last3Candles',    op: 'pattern', value: ['bear','bear','bear'] },
          { indicator: 'momentum5',       op: 'lt',      value: -0.3 },
          { indicator: 'rangeFromLowPct', op: 'lt',      value: 20 }
        ]
      },
      put: {
        logic: 'AND',
        rules: [
          { indicator: 'rsi14',           op: 'gt',      value: 70 },
          { indicator: 'last3Candles',    op: 'pattern', value: ['bull','bull','bull'] },
          { indicator: 'momentum5',       op: 'gt',      value: 0.3 },
          { indicator: 'rangeFromLowPct', op: 'gt',      value: 80 }
        ]
      }
    },

    // ── Preset 3: Bollinger Band Bounce (requires BB indicators added) ─────
    // Target win rate: 60–65%
    // Best on: 1m-5m | Requires upperBand/lowerBand in buildIndicators()
    bb_bounce: {
      id: 'bb_bounce',
      label: 'BB Bounce',
      description: 'Buy at lower BB, sell at upper BB with RSI confirmation',
      minCandles: 20,
      skip: {
        logic: 'OR',
        rules: [
          { indicator: 'bbWidth',           op: 'lt', value: 0.15 },  // squeeze = direction unknown
          { indicator: 'volatility',        op: 'gt', value: 0.003 },
          { indicator: 'lastCandleBodyPct', op: 'lt', value: 15 },
          { indicator: 'candleCount',       op: 'lt', value: 20 }
        ]
      },
      call: {
        logic: 'CONFLUENCE',
        confluenceThreshold: 3,
        rules: [
          { indicator: 'priceVsLowerBandPct', op: 'lte', value: 0.05 },  // at/below lower band
          { indicator: 'rsi14',               op: 'lt',  value: 35 },
          { indicator: 'rangeFromLowPct',     op: 'lt',  value: 15 },
          { indicator: 'momentum5',           op: 'lt',  value: -0.2 },
          { indicator: 'last3Candles',        op: 'contains', value: { item: 'bear', count: 2 } }
        ]
      },
      put: {
        logic: 'CONFLUENCE',
        confluenceThreshold: 3,
        rules: [
          { indicator: 'priceVsUpperBandPct', op: 'gte', value: -0.05 },  // at/above upper band
          { indicator: 'rsi14',               op: 'gt',  value: 65 },
          { indicator: 'rangeFromLowPct',     op: 'gt',  value: 85 },
          { indicator: 'momentum5',           op: 'gt',  value: 0.2 },
          { indicator: 'last3Candles',        op: 'contains', value: { item: 'bull', count: 2 } }
        ]
      }
    },

    // ── Preset 4: Trend Follow (SMA alignment) ────────────────────────────
    // Target win rate: 58–62% in trending markets
    // Best on: London/NY overlap | EUR/USD directional moves
    trend_follow: {
      id: 'trend_follow',
      label: 'Trend Follow',
      description: 'Trade with SMA10/SMA20 alignment and momentum',
      minCandles: 20,
      skip: {
        logic: 'OR',
        rules: [
          { indicator: 'rsi14',             op: 'between', value: [45, 55] },
          { indicator: 'volatility',        op: 'lt',      value: 0.0003 },
          { indicator: 'momentum5',         op: 'between', value: [-0.1, 0.1] },
          { indicator: 'lastCandleBodyPct', op: 'lt',      value: 20 },
          { indicator: 'candleCount',       op: 'lt',      value: 20 }
        ]
      },
      call: {
        logic: 'AND',
        rules: [
          { indicator: 'sma10VsSma20Pct',  op: 'gt',      value: 0.02 },  // SMA10 above SMA20
          { indicator: 'priceVsSma20Pct',  op: 'gt',      value: 0.05 },
          { indicator: 'momentum5',        op: 'gt',      value: 0.15 },
          { indicator: 'rsi14',            op: 'between', value: [50, 72] },
          { indicator: 'last3Candles',     op: 'contains', value: { item: 'bull', count: 2 } }
        ]
      },
      put: {
        logic: 'AND',
        rules: [
          { indicator: 'sma10VsSma20Pct',  op: 'lt',      value: -0.02 },
          { indicator: 'priceVsSma20Pct',  op: 'lt',      value: -0.05 },
          { indicator: 'momentum5',        op: 'lt',      value: -0.15 },
          { indicator: 'rsi14',            op: 'between', value: [28, 50] },
          { indicator: 'last3Candles',     op: 'contains', value: { item: 'bear', count: 2 } }
        ]
      }
    },

    // Placeholder for user-defined custom rules via dashboard
    custom: null
  }
};
```

---

## Integration: `content.js` Changes

### 1. Remove AI API call block (lines ~836–883), replace with:

```javascript
// ── Smart Signal Engine (zero AI token cost) ─────────────────────────────
if (state.settings.strategy === 'ai') {
  // Wait for candle warmup
  let candles = getBufferedCandles();
  while (candles.length < 20 && state.running && !state.stopRequested) {
    updateStatus('running', `Collecting candles: ${candles.length}/20`);
    await sleep(2000);
    candles = getBufferedCandles();
  }
  if (!state.running || state.stopRequested) return;

  const indicators = buildIndicators();
  if (!indicators) {
    updateStatus('error', 'Could not build indicators — skipping');
    await sleep(5000);
    if (state.running) runTradeCycle(generation).catch(console.error);
    return;
  }

  // Load config from chrome.storage (synced from dashboard, falls back to default)
  const stored = await new Promise(resolve =>
    chrome.storage.sync.get('signalConfig', d => resolve(d.signalConfig || null))
  );
  const config = stored || DEFAULT_SIGNAL_CONFIG;
  const activePreset = config.presets?.[config.activePreset];

  if (!activePreset) {
    updateStatus('error', `Preset "${config.activePreset}" not found`);
    await sleep(10000);
    if (state.running) runTradeCycle(generation).catch(console.error);
    return;
  }

  const result = evaluateSignal(indicators, activePreset);
  console.log(`[Avalisa] SignalEngine → ${result.signal} | ${result.reason}`);

  if (result.signal === 'SKIP') {
    updateStatus('running', `SKIP — ${result.reason}`);
    const delay = state.settings.delaySeconds || 6;
    await sleep(delay * 1000);
    if (state.running) runTradeCycle(generation).catch(console.error);
    return;
  }

  aiDecidedDirection = result.signal.toLowerCase(); // 'call' or 'put'
}
```

### 2. Add config poller (call on startup):

```javascript
async function syncSignalConfig() {
  try {
    const res = await apiGet('/api/signal-config');
    if (res?.activePreset && res?.presets) {
      await new Promise(resolve => chrome.storage.sync.set({ signalConfig: res }, resolve));
      console.log('[Avalisa] Signal config synced:', res.activePreset);
    }
  } catch (err) {
    console.warn('[Avalisa] Signal config sync failed (using cached):', err.message);
  }
}
// On startup + every 60s:
syncSignalConfig();
setInterval(syncSignalConfig, 60_000);
```

### 3. Remove `aiTokensRemaining`, `aiTokensLimit`, `aiUnlimited` from state (no longer needed)

---

## Backend Changes

### New file: `backend/src/routes/signalConfig.js`

```javascript
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const prisma = new PrismaClient();

router.get('/', authMiddleware, async (req, res) => {
  const row = await prisma.appConfig.findUnique({
    where: { key: `signal_config_${req.userId}` }
  }).catch(() => null);
  if (!row) return res.json({ activePreset: 'mean_reversion', presets: {} });
  try { res.json(JSON.parse(row.value)); }
  catch { res.json({ activePreset: 'mean_reversion', presets: {} }); }
});

router.put('/', authMiddleware, async (req, res) => {
  const config = req.body;
  if (!config.activePreset || !config.presets)
    return res.status(400).json({ error: 'Invalid config' });
  const value = JSON.stringify(config);
  if (value.length > 64000)
    return res.status(400).json({ error: 'Config too large' });
  await prisma.appConfig.upsert({
    where:  { key: `signal_config_${req.userId}` },
    update: { value },
    create: { key: `signal_config_${req.userId}`, value },
  });
  res.json({ ok: true });
});

module.exports = router;
```

### Register in `backend/src/index.js`:
```javascript
const signalConfigRouter = require('./routes/signalConfig');
app.use('/api/signal-config', signalConfigRouter);
```

No Prisma migration needed — uses existing `AppConfig` table.

---

## Dashboard Changes

New tab in strategy settings: **Signal Strategy**

- Dropdown to pick active preset: Mean Reversion / RSI Reversal / BB Bounce / Trend Follow / Custom
- Each preset shows a summary card with its entry conditions
- "Advanced" mode shows JSON editor for custom rules
- Save button → `PUT /api/signal-config` → extension picks up within 60s
- Status indicator: "Extension last synced: 2 min ago"

---

## Session & Asset Filters (Recommended Additions)

Add to the skip block of every preset OR as a global pre-check in `runTradeCycle`:

```javascript
// Session time filter (UTC hours)
function isGoodTradingSession() {
  const utcHour = new Date().getUTCHours();
  // Best: London open (8-12) and London/NY overlap (13-17)
  // Avoid: Dead zone (21-00)
  if (utcHour >= 21 || utcHour < 0) return false;
  return true;
}

// OTC pair warning
function isOtcPair(pair) {
  return pair && pair.toLowerCase().includes('otc');
}
```

If `isOtcPair()` and strategy is AI/rule-engine: show a warning in the status bar — "OTC pairs are synthetic. Consider live pairs for best results." Don't block (user choice), just warn.

---

## Files to Create / Modify

| File | Action | What |
|------|--------|------|
| `extension/signalEngine.js` | **Create** | evalRule + evalGroup + evaluateSignal functions |
| `extension/content.js` | **Edit** | Add BB indicators to buildIndicators(); replace AI API block; add syncSignalConfig(); add DEFAULT_SIGNAL_CONFIG constant; add sma10VsSma20Pct, lastCandleBodyPct fields |
| `extension/manifest.json` | **Edit** | Add signalEngine.js to content_scripts before content.js |
| `pack-extension.sh` | **Edit** | Ensure signalEngine.js is bundled first |
| `backend/src/routes/signalConfig.js` | **Create** | GET + PUT routes |
| `backend/src/index.js` | **Edit** | Register signalConfigRouter at `/api/signal-config` |
| `dashboard/src/pages/Dashboard.jsx` | **Edit** | Add Signal Strategy tab with preset picker |

---

## Implementation Order

1. **Phase 1 (Core — no dashboard needed):** Create `signalEngine.js` + edit `content.js` to replace AI call with local evaluator using `DEFAULT_SIGNAL_CONFIG`. Test locally. This alone eliminates all AI token costs.

2. **Phase 2 (Backend sync):** Add `/api/signal-config` routes. Extension polls and overwrites chrome.storage with user's saved preset.

3. **Phase 3 (Dashboard UI):** Add preset picker tab. Users can change strategy from dashboard without reloading extension.

4. **Phase 4 (Advanced):** Add Stochastic + ADX indicators, add custom JSON editor for power users, add session time filter toggle.

---

## Realistic Expectations

| Preset | Best Conditions | Expected Win Rate | Trades/Session |
|--------|----------------|------------------|----------------|
| Mean Reversion | Ranging markets, Asian session | 63–68% | 3–8 |
| RSI Reversal | Any session, clear trend exhaustion | 61–66% | 2–5 |
| BB Bounce | After adding BB indicators | 60–65% | 4–10 |
| Trend Follow | London/NY overlap, clear direction | 58–62% | 2–6 |

**Key insight from research:** The skip conditions matter as much as the entry conditions. A well-tuned system skips 70–80% of potential trades. Fewer, higher-quality trades beat frequent low-quality ones every time.

**OTC pairs:** Avoid for rule-based trading. They are broker-generated synthetic feeds — technical analysis has reduced validity on price data controlled by the counterparty.

**Money management:** Strongly recommend defaulting "AI Mode" to flat 1–2% betting, not Martingale. Martingale catastrophically fails at 6+ consecutive losses (probability ~0.4% per sequence — near-certain over 500 trades).
