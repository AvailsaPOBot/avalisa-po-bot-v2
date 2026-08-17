/**
 * Regression guard for two production defects found by live testing on
 * 2026-08-16/17 against po.trade (demo):
 *
 *  1. Avalisa AI never placed a trade at Mid or High intensity. PO returns a
 *     fixed ~1300-1400 raw ticks (~11 min) per history frame, so the candle
 *     count is span/period: ~22 at 30s but only ~10 at 60s. The gates were
 *     mid 20 / high 30 while scanning at the 60s expiry period, so they could
 *     never be satisfied — Mid is the default, so the feature was dead on
 *     arrival for most users.
 *  2. The Avalisa account password sat in po.trade's own DOM indefinitely and
 *     was printed in clear text by the start-up diagnostic dump.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const contentSource = read('extension/content.js');
const stateSource = read('extension/state.js');
const injectedSource = read('extension/injected.js');

// ── 1. Candle gates must be reachable from a real PO seed ────────────────────
// Measured live: 30s period -> 21-25 candles. Stay under the low end, and at or
// above the 15 closes RSI-14 needs before it returns a number instead of null.
const SEED_CANDLES_AT_30S = 21; // conservative floor of what PO actually sends
const RSI14_MIN_CLOSES = 15;

const gateMatch = stateSource.match(/const REQUIRED_CANDLES_BY_INTENSITY = (\{[^}]*\});/);
assert.ok(gateMatch, 'REQUIRED_CANDLES_BY_INTENSITY not found in state.js');
const gates = eval('(' + gateMatch[1] + ')');

for (const [intensity, required] of Object.entries(gates)) {
  assert.ok(
    required <= SEED_CANDLES_AT_30S,
    `intensity "${intensity}" needs ${required} candles but a 30s PO seed only yields ~${SEED_CANDLES_AT_30S} — this made Avalisa AI unable to trade`,
  );
  assert.ok(
    required >= RSI14_MIN_CLOSES || intensity === 'low',
    `intensity "${intensity}" requires ${required} candles, below the ${RSI14_MIN_CLOSES} RSI-14 needs`,
  );
}

// The analysis period must be pinned, and pinned to a period whose seed clears
// the strictest gate.
const periodMatch = stateSource.match(/const AI_ANALYSIS_PERIOD_SEC = (\d+);/);
assert.ok(periodMatch, 'AI_ANALYSIS_PERIOD_SEC not defined in state.js');
assert.strictEqual(Number(periodMatch[1]), 30, 'AI analysis period must be 30s to clear the candle gates');

// The scan path must use that constant, not the chart/expiry period.
assert.ok(
  /periodSec = AI_ANALYSIS_PERIOD_SEC/.test(contentSource),
  'ensureAvalisaDataForCurrentPair must default its period to AI_ANALYSIS_PERIOD_SEC',
);

// ── 2. History must be requested with a verb PO actually answers ─────────────
assert.ok(
  /changeSymbol/.test(injectedSource),
  'avalisaRequestHistory must use changeSymbol — PO ignores loadHistoryPeriod',
);
assert.ok(
  !/loadHistoryPeriod"\s*,/.test(injectedSource),
  'loadHistoryPeriod is never answered by PO; it must not be used to fetch history',
);

// ── 3. No credential may be logged or left in the page ──────────────────────
assert.ok(
  !/console\.log\('\[Avalisa\] Input found:'[^)]*inp\.value/.test(contentSource),
  'the PO diagnostic dump must never log input values (it printed the account password)',
);
assert.ok(
  /if \(inp\.type === 'password'\)/.test(contentSource),
  'the diagnostic dump must special-case password inputs',
);
assert.ok(
  /function consumePasswordField/.test(contentSource),
  'handleLogin must consume (and clear) the password field so it does not persist in po.trade DOM',
);
assert.ok(
  /const password = consumePasswordField\(\);/.test(contentSource),
  'handleLogin must read the password via consumePasswordField',
);

// ── 4. Verbose socket tracing stays behind the debug flag ────────────────────
for (const marker of ['WS EVENT:', 'Socket.IO binary placeholder:', 'WS raw msg #']) {
  const line = contentSource.split('\n').find(l => l.includes(marker));
  assert.ok(line, `expected a log line containing ${marker}`);
  assert.ok(
    line.includes('debugLog('),
    `"${marker}" must be gated behind debugLog — it fired on every socket frame of a live trading page`,
  );
}

console.log('Extension AI-candle + secret-handling smoke passed.');
